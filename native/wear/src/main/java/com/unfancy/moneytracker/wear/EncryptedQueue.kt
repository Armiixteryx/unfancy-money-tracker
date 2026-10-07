package com.unfancy.moneytracker.wear

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import android.util.AtomicFile
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class Recording(
    val requestId: String,
    val accountId: String,
    val phoneNodeId: String,
    val recordedAt: String,
    val durationMs: Long,
    val mimeType: String,
    val audio: ByteArray,
    /** Absent only for pre-v2 recordings; migration always resolves this to the personal tracker. */
    val trackerId: String? = null,
    val membershipId: String? = null,
    val generation: Long? = null,
    val localDate: String? = null,
    val protocolVersion: Int = 1,
)

internal interface DurableQueueFile {
    fun read(): ByteArray?
    fun write(bytes: ByteArray): Boolean
}

internal class AtomicDurableQueueFile(context: Context) : DurableQueueFile {
    private val file = File(context.noBackupFilesDir, "watch-recordings.enc")
    private val atomicFile = AtomicFile(file)

    override fun read(): ByteArray? {
        if (!file.exists() && !File(file.path + ".bak").exists()) return null
        return atomicFile.openRead().use { it.readBytes() }
    }

    override fun write(bytes: ByteArray): Boolean {
        var output: java.io.FileOutputStream? = null
        return try {
            output = atomicFile.startWrite()
            output.write(bytes)
            atomicFile.finishWrite(output)
            true
        } catch (_: Exception) {
            output?.let { atomicFile.failWrite(it) }
            false
        }
    }
}

/** Small encrypted, atomic queue; plaintext audio exists only in memory while recording/sending. */
internal class EncryptedQueue(
    context: Context? = null,
    private val storage: DurableQueueFile = AtomicDurableQueueFile(requireNotNull(context)),
    testKey: SecretKey? = null,
) {
    private val key: SecretKey by lazy { testKey ?: loadOrCreateKey() }
    private var unreadable = false

    fun list(): List<Recording> {
        return synchronized(QUEUE_LOCK) {
            val packed = storage.read() ?: return@synchronized emptyList()
            try {
            val iv = packed.copyOfRange(0, 12)
            val ciphertext = packed.copyOfRange(12, packed.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            val rows = JSONArray(String(cipher.doFinal(ciphertext), Charsets.UTF_8))
            (0 until rows.length()).map { i ->
                val row = rows.getJSONObject(i)
                Recording(row.getString("requestId"), row.getString("accountId"), row.getString("phoneNodeId"),
                    row.getString("recordedAt"), row.getLong("durationMs"), row.getString("mimeType"),
                    java.util.Base64.getDecoder().decode(row.getString("audio")),
                    row.takeIf { !it.isNull("trackerId") }?.optString("trackerId")?.takeIf { it.isNotBlank() },
                    row.takeIf { !it.isNull("membershipId") }?.optString("membershipId")?.takeIf { it.isNotBlank() },
                    row.optLong("generation", -1L).takeIf { it >= 0 },
                    row.takeIf { !it.isNull("localDate") }?.optString("localDate")?.takeIf { it.isNotBlank() },
                    row.optInt("protocolVersion", 1))
            }
            } catch (_: Exception) {
                // Keep the encrypted source intact for recovery and fail closed.
                unreadable = true
                emptyList()
            }
        }
    }

    fun add(recording: Recording): Boolean = synchronized(QUEUE_LOCK) {
        val current = list()
        if (unreadable || !QueuePolicy.canEnqueue(current.size)) return@synchronized false
        if (current.any { it.requestId == recording.requestId }) return@synchronized false
        write(current + recording)
    }

    fun remove(requestId: String): Boolean = synchronized(QUEUE_LOCK) {
        val current = list()
        if (unreadable || current.none { it.requestId == requestId }) return@synchronized false
        write(current.filterNot { it.requestId == requestId })
    }

    /** Durably pin pre-v2 clips to the originating account's personal tracker. */
    fun migrateLegacyToPersonal(accountId: String, phoneNodeId: String, trackerId: String, generation: Long,
                                membershipId: String? = null): Boolean = synchronized(QUEUE_LOCK) {
        val current = list()
        if (unreadable) return@synchronized false
        val updated = current.map { row ->
            if (row.accountId == accountId && row.phoneNodeId == phoneNodeId && row.trackerId == null && row.protocolVersion < 2)
                row.copy(trackerId = trackerId, membershipId = membershipId, generation = generation, protocolVersion = 2)
            else row
        }
        if (updated == current) return@synchronized true
        write(updated)
    }

    fun size(): Int = list().size
    fun available(): Boolean { list(); return !unreadable }

    private fun write(rows: List<Recording>): Boolean = try {
        val json = JSONArray()
        rows.forEach { row ->
            json.put(JSONObject().put("requestId", row.requestId).put("accountId", row.accountId)
                .put("phoneNodeId", row.phoneNodeId).put("recordedAt", row.recordedAt).put("durationMs", row.durationMs)
                .put("mimeType", row.mimeType).put("audio", java.util.Base64.getEncoder().encodeToString(row.audio))
                .put("protocolVersion", row.protocolVersion)
                .put("trackerId", row.trackerId ?: JSONObject.NULL)
                .put("membershipId", row.membershipId ?: JSONObject.NULL)
                .put("generation", row.generation ?: JSONObject.NULL)
                .put("localDate", row.localDate ?: JSONObject.NULL))
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val encrypted = cipher.iv + cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8))
        storage.write(encrypted)
    } catch (_: Exception) { false }

    private fun loadOrCreateKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance("AES", "AndroidKeyStore")
        generator.init(android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS,
            android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build())
        return generator.generateKey()
    }

    companion object {
        private const val KEY_ALIAS = "unfancy.watch.queue.aes.v1"
        private val QUEUE_LOCK = Any()
    }
}

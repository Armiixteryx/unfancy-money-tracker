package com.unfancy.moneytracker.wear

import android.content.Context
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class EncryptedBindingStore(context: Context) {
    private val file = AtomicFile(File(context.noBackupFilesDir, "watch-binding.enc"))
    private val key by lazy { loadOrCreateKey() }

    fun read(): PhoneBinding? = synchronized(LOCK) {
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return@synchronized null
        val packed = file.openRead().use { it.readBytes() }
        require(packed.size > 28)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, packed.copyOfRange(0, 12)))
        val json = JSONObject(String(cipher.doFinal(packed.copyOfRange(12, packed.size)), Charsets.UTF_8))
        val targets = json.optJSONArray("targets")?.let { rows ->
            (0 until rows.length()).map { index ->
                val row = rows.getJSONObject(index)
                WatchTarget(row.getString("datasetId"), row.getString("name"),
                    if (row.isNull("membershipId")) null else row.getString("membershipId"),
                    row.getLong("generation"), row.getString("kind"))
            }
        } ?: emptyList()
        PhoneBinding(json.getString("accountId"), json.getString("nodeId"), Base64.decode(json.getString("publicKey"), Base64.NO_WRAP),
            json.optInt("protocolVersion", 1), targets,
            json.takeIf { !it.isNull("selectedTrackerId") }?.optString("selectedTrackerId")?.takeIf { it.isNotBlank() })
    }

    fun save(binding: PhoneBinding?) = synchronized(LOCK) {
        if (binding == null) {
            file.delete()
            return@synchronized
        }
        val json = JSONObject().put("accountId", binding.accountId).put("nodeId", binding.nodeId)
            .put("publicKey", Base64.encodeToString(binding.publicKey, Base64.NO_WRAP))
            .put("protocolVersion", binding.protocolVersion)
            .put("targets", org.json.JSONArray().apply {
                binding.targets.forEach { target ->
                    put(JSONObject().put("datasetId", target.datasetId).put("name", target.name)
                        .put("membershipId", target.membershipId ?: JSONObject.NULL).put("generation", target.generation)
                        .put("kind", target.kind))
                }
            })
            .put("selectedTrackerId", binding.selectedTrackerId ?: JSONObject.NULL)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val bytes = cipher.iv + cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8))
        val output = file.startWrite()
        try { output.write(bytes); file.finishWrite(output) } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }
    }

    private fun loadOrCreateKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
            init(android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    companion object {
        private const val KEY_ALIAS = "unfancy.watch.binding.aes.v1"
        private val LOCK = Any()
    }
}

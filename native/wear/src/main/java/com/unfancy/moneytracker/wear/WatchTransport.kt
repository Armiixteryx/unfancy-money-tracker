package com.unfancy.moneytracker.wear

import android.content.Context
import android.net.Uri
import android.util.Base64
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.security.KeyFactory
import java.security.spec.MGF1ParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.time.Instant
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

internal data class WatchTarget(val datasetId: String, val name: String, val membershipId: String?, val generation: Long, val kind: String)
internal data class PhoneBinding(
    val accountId: String,
    val nodeId: String,
    val publicKey: ByteArray,
    val protocolVersion: Int = 1,
    val targets: List<WatchTarget> = emptyList(),
    val selectedTrackerId: String? = null,
)

internal class WatchTransport(private val context: Context) {
    private val bindingStore = EncryptedBindingStore(context)
    private val prefs = context.getSharedPreferences("watch-result", Context.MODE_PRIVATE)
    private val queue = EncryptedQueue(context)
    private val sending = senderGlobally

    fun binding(): PhoneBinding? = try { bindingStore.read() } catch (_: Exception) { null }
    fun lastOutcome(): String? = prefs.getString("lastOutcome", null)
    fun clearOutcome() { prefs.edit().remove("lastOutcome").apply() }

    fun acceptSetup(payload: ByteArray, sourceNodeId: String) {
        try {
            val setup = JSONObject(String(payload, Charsets.UTF_8))
            val account = setup.optString("accountId")
            val protocol = setup.optInt("protocol", 1).coerceIn(1, 2)
            val current = binding()
            if (account.isBlank()) {
                if (current == null || current.nodeId == sourceNodeId) bindingStore.save(null)
                return
            }
            val encryption = setup.getJSONObject("encryption")
            require(encryption.getInt("version") == 1)
            require(encryption.getString("algorithm") == ALGORITHM)
            val publicKey = Base64.decode(encryption.getString("publicKey"), Base64.NO_WRAP)
            val targets = if (protocol >= 2) {
                val rows = setup.getJSONArray("targets")
                (0 until rows.length()).map { index ->
                    val row = rows.getJSONObject(index)
                    val datasetId = row.getString("datasetId")
                    val name = row.getString("name")
                    val membershipId = if (row.isNull("membershipId")) null else row.getString("membershipId")
                    val generation = row.getLong("generation")
                    val kind = row.getString("kind")
                    require(UUID_V7.matches(datasetId) && (membershipId == null || UUID_V7.matches(membershipId)))
                    require(name.isNotBlank() && name.length <= 80 && generation >= 0 && kind in setOf("personal", "shared"))
                    require((kind == "personal") == (membershipId == null))
                    WatchTarget(datasetId, name, membershipId, generation, kind)
                }.also { require(it.map(WatchTarget::datasetId).distinct().size == it.size) }
            } else emptyList()
            // Do not silently move queued audio between user accounts.
            val pending = queue.list()
            if (!queue.available()) return
            if (!QueuePolicy.canRebind(pending, account, sourceNodeId)) {
                // The trusted phone switched accounts; retain each clip for its original account and pause uploads.
                if (current?.nodeId == sourceNodeId && current.accountId != account) bindingStore.save(null)
                return
            }
            val sameOrigin = current?.accountId == account && current.nodeId == sourceNodeId
            val selected = if (sameOrigin) current?.selectedTrackerId else null
            val selectedOrPersonal = selected ?: targets.firstOrNull { it.kind == "personal" }?.datasetId
            val personal = targets.firstOrNull { it.kind == "personal" }
            if (protocol >= 2 && personal != null) {
                queue.migrateLegacyToPersonal(account, sourceNodeId, personal.datasetId, personal.generation, personal.membershipId)
            }
            bindingStore.save(PhoneBinding(account, sourceNodeId, publicKey, protocol, targets, selectedOrPersonal))
        } catch (_: Exception) { /* malformed setup is ignored */ }
    }

    fun selectTarget(datasetId: String): Boolean {
        val phone = binding() ?: return false
        val target = phone.targets.firstOrNull { it.datasetId == datasetId } ?: return false
        if (phone.protocolVersion < 2) return false
        bindingStore.save(phone.copy(selectedTrackerId = target.datasetId))
        return true
    }

    suspend fun transferPending() {
        try {
            val phone = binding() ?: return
            sending.drain({ queue.list().firstOrNull() }) { recording ->
            // Keep one item in flight until its terminal receipt arrives; duplicate puts retain UUID idempotency.
            require(recording.accountId == phone.accountId && recording.phoneNodeId == phone.nodeId)
            val envelope = encryptForPhone(recording.audio, phone.publicKey)
            val path = "$RECORDING_PATH/${recording.requestId}"
            val request = PutDataMapRequest.create(path).apply {
                dataMap.putString("requestId", recording.requestId)
                dataMap.putString("accountId", recording.accountId)
                    dataMap.putString("recordedAt", recording.recordedAt)
                    dataMap.putLong("durationMs", recording.durationMs)
                dataMap.putString("mimeType", recording.mimeType)
                dataMap.putInt("protocolVersion", recording.protocolVersion)
                if (recording.protocolVersion >= 2) {
                    dataMap.putString("trackerId", requireNotNull(recording.trackerId))
                    recording.membershipId?.let { dataMap.putString("membershipId", it) }
                    dataMap.putLong("generation", requireNotNull(recording.generation))
                    recording.localDate?.let { dataMap.putString("localDate", it) }
                }
                dataMap.putAsset("audio", Asset.createFromBytes(envelope))
            }.asPutDataRequest().setUrgent()
            Wearable.getDataClient(context).putDataItem(request).await()
            }
        } catch (_: Exception) {
            // Retain all entries; connection and backend errors are retried on reconnect/manual retry.
        }
    }

    suspend fun acceptAck(payload: ByteArray, sourceNodeId: String): Boolean {
        try {
            val ack = JSONObject(String(payload, Charsets.UTF_8))
            val requestId = ack.getString("requestId")
            val accountId = ack.optString("accountId")
            val status = ack.optString("status")
            val trackerId = ack.optString("trackerId").takeIf { it.isNotBlank() && it != "null" }
            val membershipId = ack.optString("membershipId").takeIf { it.isNotBlank() && it != "null" }
            val generation = ack.optLong("generation", -1L).takeIf { it >= 0 }
            // A terminal phone receipt is the only event allowed to erase queued audio.
            val recording = queue.list().firstOrNull { it.requestId == requestId }
            if (!QueuePolicy.ackMatches(recording, requestId, accountId, sourceNodeId, status, trackerId, membershipId, generation)) return false
            // DataItems are created under this watch's node. Wildcard host deletes the local synced item.
            Wearable.getDataClient(context).deleteDataItems(Uri.parse("wear://*$RECORDING_PATH/$requestId")).await()
            prefs.edit().putString("lastOutcome", status).apply()
            return queue.remove(requestId)
        } catch (_: Exception) { /* malformed or stale ack cannot delete data */ }
        return false
    }

    suspend fun requestSetup() {
        try {
            for (node in Wearable.getNodeClient(context).connectedNodes.await()) {
                Wearable.getMessageClient(context).sendMessage(node.id, SETUP_REQUEST_PATH,
                    "{\"protocol\":2}".toByteArray(Charsets.UTF_8)).await()
            }
        } catch (_: Exception) { /* pairing and setup can be retried when the app resumes */ }
    }

    private fun encryptForPhone(audio: ByteArray, encodedPublicKey: ByteArray): ByteArray {
        val publicKey = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(encodedPublicKey))
        val aesGenerator = KeyGenerator.getInstance("AES").apply { init(256) }
        val aesKey = aesGenerator.generateKey()
        val iv = ByteArray(12).also { java.security.SecureRandom().nextBytes(it) }
        val aes = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, aesKey, GCMParameterSpec(128, iv)) }
        val sealed = aes.doFinal(audio)
        val tag = sealed.copyOfRange(sealed.size - 16, sealed.size)
        val ciphertext = sealed.copyOfRange(0, sealed.size - 16)
        val rsa = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding")
        rsa.init(Cipher.ENCRYPT_MODE, publicKey, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
        val wrapped = rsa.doFinal(aesKey.encoded)
        return JSONObject().put("v", 1).put("alg", ALGORITHM)
            .put("key", Base64.encodeToString(wrapped, Base64.NO_WRAP))
            .put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
            .put("tag", Base64.encodeToString(tag, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .toString().toByteArray(Charsets.UTF_8)
    }

    companion object {
        const val STATE_CHANGED_ACTION = "com.unfancy.moneytracker.wear.STATE_CHANGED"
        const val SETUP_PATH = "/unfancy/watch/setup"
        const val SETUP_REQUEST_PATH = "/unfancy/watch/setup/request"
        const val ACK_PATH = "/unfancy/watch/ack"
        const val RECORDING_PATH = "/unfancy/watch/recordings"
        private const val ALGORITHM = "RSA-OAEP-256+A256GCM"
        private val UUID_V7 = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        private val senderGlobally = SequentialTransfer()
    }
}

internal fun newRequestId(): String {
    val millis = Instant.now().toEpochMilli()
    val random = UUID.randomUUID()
    val most = (millis shl 16) or (0x7000L) or ((random.mostSignificantBits ushr 48) and 0x0fffL)
    val least = (random.leastSignificantBits and 0x3fffffffffffffffL) or Long.MIN_VALUE
    return UUID(most, least).toString()
}

package com.unfancy.moneytracker.watch

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.MGF1ParameterSpec
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

internal data class WatchAudioRequest(
  val requestId: String, val accountId: String, val recordedAt: String, val mimeType: String,
  val status: String, val durationMs: Long? = null, val errorCode: String? = null, val sourceNodeId: String = "",
  val trackerId: String? = null, val membershipId: String? = null, val generation: Long? = null,
  val localDate: String? = null, val protocolVersion: Int = 1,
)
internal data class PhoneWatchTarget(val datasetId: String, val name: String, val membershipId: String?, val generation: Long, val kind: String)

internal interface WatchAudioDisk {
  fun read(name: String): ByteArray?
  fun writeAtomic(name: String, bytes: ByteArray)
  fun delete(name: String)
}

internal interface WatchAudioKeyProvider {
  fun get(alias: String): javax.crypto.SecretKey
  fun delete(alias: String)
}

/** Encrypted, crash-safe inbox separate from financial data and reset workflows. */
internal class WatchAudioStore(private val disk: WatchAudioDisk, private val keys: WatchAudioKeyProvider) {
  constructor(context: Context) : this(AndroidWatchAudioDisk(context), AndroidWatchAudioKeyProvider())

  private fun encrypt(bytes: ByteArray, secret: javax.crypto.SecretKey): ByteArray {
    val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, secret)
    return c.iv + c.doFinal(bytes)
  }
  private fun decrypt(bytes: ByteArray, secret: javax.crypto.SecretKey): ByteArray {
    require(bytes.size > 12) { "invalid_ciphertext" }
    val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    return c.doFinal(bytes.copyOfRange(12, bytes.size))
  }

  private fun records(): JSONArray {
    val bytes = disk.read("metadata") ?: return JSONArray()
    val clear = decrypt(bytes, keys.get(METADATA_KEY))
    return JSONArray(String(clear, Charsets.UTF_8))
  }
  private fun saveRecords(arr: JSONArray) = disk.writeAtomic("metadata", encrypt(arr.toString().toByteArray(Charsets.UTF_8), keys.get(METADATA_KEY)))
  private fun objectFor(a: JSONArray, id: String): JSONObject? = (0 until a.length()).map { a.optJSONObject(it) }.firstOrNull { it?.optString("requestId") == id }

  fun insert(meta: WatchAudioRequest, audio: ByteArray): Boolean = synchronized(PROCESS_LOCK) {
    require(UUID_V7.matches(meta.requestId)) { "invalid_request_id" }
    require(audio.isNotEmpty() && audio.size <= 1_048_576) { "audio_size_invalid" }
    val arr = records()
    if (objectFor(arr, meta.requestId) != null) return@synchronized false
    val name = audioName(meta.requestId)
    try { disk.writeAtomic(name, encrypt(audio, keys.get(audioAlias(meta.requestId)))) }
    catch (e: Exception) { runCatching { keys.delete(audioAlias(meta.requestId)) }; throw e }
    arr.put(toJson(meta))
    try { saveRecords(arr) } catch (e: Exception) { disk.delete(name); runCatching { keys.delete(audioAlias(meta.requestId)) }; throw e }
    true
  }
  fun list(): List<WatchAudioRequest> = synchronized(PROCESS_LOCK) { val a = records(); (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(::fromJson) } }
  fun find(id: String): WatchAudioRequest? = list().firstOrNull { it.requestId == id }
  fun read(id: String): ByteArray = synchronized(PROCESS_LOCK) {
    require(UUID_V7.matches(id)) { "invalid_request_id" }
    decrypt(disk.read(audioName(id)) ?: error("audio_missing"), keys.get(audioAlias(id)))
  }
  fun bindLegacyPersonalTarget(id: String, accountId: String, target: PhoneWatchTarget): Boolean = synchronized(PROCESS_LOCK) {
    if (boundAccount() != accountId || target.kind != "personal" || target.membershipId != null) return@synchronized false
    val a = records(); val item = objectFor(a, id) ?: return@synchronized false
    if (item.optString("accountId") != accountId) return@synchronized false
    val existingTracker = item.takeIf { !it.isNull("trackerId") }?.optString("trackerId")
    if (!existingTracker.isNullOrBlank()) return@synchronized existingTracker == target.datasetId
    item.put("trackerId", target.datasetId).put("generation", target.generation)
      .put("membershipId", JSONObject.NULL).put("protocolVersion", 2)
    saveRecords(a); true
  }
  fun claimPending(id: String, accountId: String): Boolean = synchronized(PROCESS_LOCK) {
    val a = records(); val o = objectFor(a, id) ?: return@synchronized false
    if (!WatchQueuePolicy.canClaim(o.optString("status"), o.optString("accountId"), accountId)) return@synchronized false
    o.put("status", "processing"); o.remove("errorCode"); saveRecords(a); true
  }
  fun update(id: String, status: String, error: String? = null): Boolean = synchronized(PROCESS_LOCK) {
    val a = records(); val o = objectFor(a, id) ?: return@synchronized false
    if (status == "failed" && !WatchQueuePolicy.canMarkFailed(o.optString("status"))) return@synchronized false
    if (status == "completed") return@synchronized markCompletedLocked(a, o)
    require(status == "failed") { "invalid_queue_transition" }
    o.put("status", status); if (error == null) o.remove("errorCode") else o.put("errorCode", error)
    saveRecords(a); true
  }
  private fun markCompletedLocked(arr: JSONArray, item: JSONObject): Boolean {
    if (item.optString("status") != "completed") {
      require(WatchQueuePolicy.canMarkCompleted(item.optString("status"))) { "invalid_terminal_transition" }
      item.put("status", "completed"); item.remove("errorCode"); saveRecords(arr)
    }
    cleanupTerminalAudio(item.getString("requestId"))
    return true
  }
  fun cleanupTerminalAudio(id: String) = synchronized(PROCESS_LOCK) {
    val req = objectFor(records(), id) ?: return@synchronized
    require(WatchQueuePolicy.isTerminal(req.optString("status")))
    if (req.optString("status") == "completed" || req.optString("status") == "deleted") eraseAudio(id)
  }
  fun markCompleted(id: String): Boolean = synchronized(PROCESS_LOCK) {
    val a = records(); val o = objectFor(a, id) ?: return@synchronized false
    markCompletedLocked(a, o)
  }
  fun failPendingForCurrentBinding(code: String, includeProcessing: Boolean = true): List<WatchAudioRequest> = synchronized(PROCESS_LOCK) {
    val account = boundAccount() ?: return@synchronized emptyList()
    val safeCode = code.takeIf { it.matches(Regex("^[a-z0-9_]{1,48}$")) } ?: "authentication_required"
    val arr = records(); val failed = mutableListOf<WatchAudioRequest>()
    for (i in 0 until arr.length()) {
      val item = arr.optJSONObject(i) ?: continue
      if (item.optString("accountId") == account && (item.optString("status") == "pending" || (includeProcessing && item.optString("status") == "processing"))) {
        item.put("status", "failed"); item.put("errorCode", safeCode); failed.add(fromJson(item))
      }
    }
    if (failed.isNotEmpty()) saveRecords(arr)
    failed
  }
  fun remove(id: String): Boolean = synchronized(PROCESS_LOCK) {
    require(UUID_V7.matches(id)) { "invalid_request_id" }
    val a = records(); val o = objectFor(a, id) ?: return@synchronized false
    if (o.optString("status") != "deleted") { o.put("status", "deleted"); o.remove("errorCode"); saveRecords(a) }
    // Roll back only while the original decryption key still exists.
    try { keys.delete(audioAlias(id)) } catch (e: Exception) {
      o.put("status", "failed"); o.put("errorCode", "delete_failed")
      try { saveRecords(a) } catch (_: Exception) { }
      throw e
    }
    // After crypto erasure the tombstone must remain durable even if filesystem cleanup fails.
    disk.delete(audioName(id))
    true
  }
  private fun eraseAudio(id: String) { keys.delete(audioAlias(id)); disk.delete(audioName(id)) }
  private fun audioName(id: String) = "audio:$id"
  private fun audioAlias(id: String) = "unfancy_watch_audio_$id"
  private fun binding(): JSONObject = disk.read("binding")?.let { JSONObject(String(decrypt(it, keys.get(METADATA_KEY)), Charsets.UTF_8)) } ?: JSONObject()
  private fun saveBinding(j: JSONObject) = disk.writeAtomic("binding", encrypt(j.toString().toByteArray(Charsets.UTF_8), keys.get(METADATA_KEY)))
  fun boundAccount(): String? = synchronized(PROCESS_LOCK) { binding().optString("accountId").takeIf { it.isNotBlank() } }
  fun boundNode(): String? = synchronized(PROCESS_LOCK) { binding().optString("nodeId").takeIf { it.isNotBlank() } }
  fun targets(): List<PhoneWatchTarget> = synchronized(PROCESS_LOCK) {
    val bytes = disk.read("targets") ?: return@synchronized emptyList()
    val clear = decrypt(bytes, keys.get(METADATA_KEY))
    val rows = JSONArray(String(clear, Charsets.UTF_8))
    (0 until rows.length()).map { index ->
      val row = rows.getJSONObject(index)
      PhoneWatchTarget(row.getString("datasetId"), row.getString("name"),
        if (row.isNull("membershipId")) null else row.getString("membershipId"), row.getLong("generation"), row.getString("kind"))
    }
  }
  fun setTargets(targets: List<PhoneWatchTarget>) = synchronized(PROCESS_LOCK) {
    val rows = JSONArray().apply { targets.forEach { target ->
      put(JSONObject().put("datasetId", target.datasetId).put("name", target.name)
        .put("membershipId", target.membershipId ?: JSONObject.NULL).put("generation", target.generation).put("kind", target.kind))
    } }
    disk.writeAtomic("targets", encrypt(rows.toString().toByteArray(Charsets.UTF_8), keys.get(METADATA_KEY)))
  }
  fun bind(accountId: String?, nodeId: String? = boundNode()) { synchronized(PROCESS_LOCK) {
    val j = binding()
    val previousAccount = j.optString("accountId").takeIf { it.isNotBlank() }
    if (previousAccount != accountId) {
      // A catalog is scoped to the signed-in subject. Never send the prior
      // account's tracker names or IDs as setup for a newly bound account.
      disk.writeAtomic("targets", encrypt("[]".toByteArray(Charsets.UTF_8), keys.get(METADATA_KEY)))
    }
    if (accountId == null) j.remove("accountId") else j.put("accountId", accountId)
    if (nodeId == null) j.remove("nodeId") else j.put("nodeId", nodeId)
    saveBinding(j)
  } }
  fun pinNode(nodeId: String) { synchronized(PROCESS_LOCK) { val j = binding(); j.put("nodeId", nodeId); saveBinding(j) } }

  fun setupPublicKey(nodeId: String): String? = synchronized(PROCESS_LOCK) {
    if (boundAccount().isNullOrBlank()) return null
    pinNode(nodeId)
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val alias = "unfancy_watch_rsa_v1"
    val pair: KeyPair = if (ks.containsAlias(alias)) {
      val cert = ks.getCertificate(alias); KeyPair(cert.publicKey, ks.getKey(alias, null) as java.security.PrivateKey)
    } else {
      KeyPairGenerator.getInstance("RSA", "AndroidKeyStore").run {
        initialize(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_DECRYPT or KeyProperties.PURPOSE_ENCRYPT)
          .setDigests(KeyProperties.DIGEST_SHA1, KeyProperties.DIGEST_SHA256).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP).setKeySize(2048).build())
        generateKeyPair()
      }
    }
    return@synchronized Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP)
  }

  fun decryptWearEnvelope(bytes: ByteArray): ByteArray {
    val j = JSONObject(String(bytes, Charsets.UTF_8)); require(j.optInt("v") == 1 && j.optString("alg") == "RSA-OAEP-256+A256GCM") { "unsupported_envelope" }
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val privateKey = ks.getKey("unfancy_watch_rsa_v1", null) as java.security.PrivateKey
    val unwrap = Cipher.getInstance("RSA/ECB/OAEPPadding")
    unwrap.init(Cipher.DECRYPT_MODE, privateKey, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT))
    val aes = unwrap.doFinal(Base64.decode(j.getString("key"), Base64.NO_WRAP))
    val gcm = Cipher.getInstance("AES/GCM/NoPadding")
    gcm.init(Cipher.DECRYPT_MODE, javax.crypto.spec.SecretKeySpec(aes, "AES"), GCMParameterSpec(128, Base64.decode(j.getString("iv"), Base64.NO_WRAP)))
    return gcm.doFinal(Base64.decode(j.getString("ciphertext"), Base64.NO_WRAP) + Base64.decode(j.getString("tag"), Base64.NO_WRAP))
  }

  private fun toJson(r: WatchAudioRequest) = JSONObject().put("requestId", r.requestId).put("accountId", r.accountId).put("recordedAt", r.recordedAt).put("mimeType", r.mimeType).put("status", r.status).put("durationMs", r.durationMs ?: JSONObject.NULL).put("errorCode", r.errorCode ?: JSONObject.NULL).put("sourceNodeId", r.sourceNodeId)
    .put("trackerId", r.trackerId ?: JSONObject.NULL).put("membershipId", r.membershipId ?: JSONObject.NULL)
    .put("generation", r.generation ?: JSONObject.NULL).put("localDate", r.localDate ?: JSONObject.NULL).put("protocolVersion", r.protocolVersion)
  private fun fromJson(o: JSONObject) = WatchAudioRequest(o.getString("requestId"), o.getString("accountId"), o.getString("recordedAt"), o.getString("mimeType"), o.getString("status"), if (o.isNull("durationMs")) null else o.optLong("durationMs"), if (o.isNull("errorCode")) null else o.optString("errorCode"), o.optString("sourceNodeId"), if (o.isNull("trackerId")) null else o.optString("trackerId"), if (o.isNull("membershipId")) null else o.optString("membershipId"), if (o.isNull("generation")) null else o.optLong("generation"), if (o.isNull("localDate")) null else o.optString("localDate"), o.optInt("protocolVersion", 1))

  companion object {
    private const val METADATA_KEY = "unfancy_watch_metadata_v1"
    private val PROCESS_LOCK = Any()
    private val UUID_V7 = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
  }
}

internal class AndroidWatchAudioDisk(context: Context) : WatchAudioDisk {
  private val root = File(context.noBackupFilesDir, "watch-audio").apply { mkdirs() }
  private fun file(name: String): File = when (name) {
    "metadata" -> File(root, "metadata.enc")
    "binding" -> File(root, "binding.enc")
    "targets" -> File(root, "targets.enc")
    else -> File(root, name.replace(':', '-') + ".enc")
  }
  private fun atomicFile(name: String) = android.util.AtomicFile(file(name))
  override fun read(name: String): ByteArray? {
    if (name != "metadata" && name != "binding" && name != "targets") return file(name).takeIf { it.exists() }?.readBytes()
    val atomic = atomicFile(name)
    if (!atomic.baseFile.exists() && !File(atomic.baseFile.path + ".bak").exists()) return null
    return atomic.openRead().use { it.readBytes() }
  }
  override fun writeAtomic(name: String, bytes: ByteArray) {
    if (name == "metadata" || name == "binding" || name == "targets") {
      val atomic = atomicFile(name); val stream = atomic.startWrite()
      try { stream.write(bytes); atomic.finishWrite(stream) } catch (e: Exception) { atomic.failWrite(stream); throw e }
    } else {
      val target = file(name); val temp = File(target.path + ".tmp")
      java.io.FileOutputStream(temp).use { it.write(bytes); it.fd.sync() }
      if (target.exists()) check(target.delete()) { "audio_replace_failed" }
      check(temp.renameTo(target)) { "audio_write_failed" }
    }
  }
  override fun delete(name: String) {
    listOf(file(name), File(file(name).path + ".bak"), File(file(name).path + ".tmp")).forEach {
      if (it.exists()) check(it.delete()) { "audio_delete_failed" }
    }
  }
}

internal class AndroidWatchAudioKeyProvider : WatchAudioKeyProvider {
  override fun get(alias: String): javax.crypto.SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? javax.crypto.SecretKey)?.let { return it }
    return javax.crypto.KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true).build())
      generateKey()
    }
  }
  override fun delete(alias: String) {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (store.containsAlias(alias)) store.deleteEntry(alias)
  }
}

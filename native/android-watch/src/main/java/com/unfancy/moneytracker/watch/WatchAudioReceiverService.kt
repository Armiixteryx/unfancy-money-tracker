package com.unfancy.moneytracker.watch

import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.Executors

class WatchAudioReceiverService : WearableListenerService() {
  private val executor = Executors.newSingleThreadExecutor()
  private val store by lazy { WatchAudioStore(applicationContext) }

  override fun onDataChanged(events: DataEventBuffer) {
    events.forEach { event ->
      if (event.type != DataEvent.TYPE_CHANGED) return@forEach
      val uri = event.dataItem.uri
      if (!uri.path.orEmpty().startsWith("/unfancy/watch/recordings/")) return@forEach
      val snapshot = event.dataItem.freeze()
      executor.execute { receive(snapshot.uri, snapshot) }
    }
  }

  private fun receive(uri: Uri, item: com.google.android.gms.wearable.DataItem) {
    val requestId = uri.lastPathSegment ?: return
    try {
      val map = DataMapItem.fromDataItem(item).dataMap
      val sourceNodeId = uri.host ?: ""
      val id = map.getString("requestId") ?: requestId
      val accountId = map.getString("accountId") ?: ""
      val recordedAt = map.getString("recordedAt") ?: ""
      val mimeType = map.getString("mimeType") ?: "audio/mp4"
      val durationMs = map.getLong("durationMs", 0L)
      val protocolVersion = map.getInt("protocolVersion", 1)
      val trackerId = map.getString("trackerId")?.takeIf { it.isNotBlank() }
      val membershipId = map.getString("membershipId")?.takeIf { it.isNotBlank() }
      val generation = if (map.containsKey("generation")) map.getLong("generation") else null
      val localDate = map.getString("localDate")?.takeIf { it.isNotBlank() }
      val legacyPersonal = if (protocolVersion == 1) store.targets().firstOrNull { it.kind == "personal" } else null
      val resolvedTrackerId = trackerId ?: legacyPersonal?.datasetId
      val resolvedMembershipId = membershipId ?: legacyPersonal?.membershipId
      val resolvedGeneration = generation ?: legacyPersonal?.generation
      if (id != requestId || !UUID_V7.matches(id) || sourceNodeId.isBlank()) return
      val existing = store.find(id)
      if (existing != null) {
        if (existing.accountId != accountId || existing.sourceNodeId != sourceNodeId ||
          existing.trackerId != resolvedTrackerId || existing.membershipId != resolvedMembershipId || existing.generation != resolvedGeneration) return
        if (WatchQueuePolicy.isTerminal(existing.status)) sendAck(sourceNodeId, id, existing.accountId, existing.status, existing.errorCode)
        else {
          sendAck(sourceNodeId, id, existing.accountId, "accepted", null)
          WorkManager.getInstance(this).enqueueUniqueWork("watch-audio-handoff-$id", ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<WatchAudioHandoffWorker>().build())
        }
        return
      }
      val validDate = localDate == null || runCatching { java.time.LocalDate.parse(localDate).toString() == localDate }.getOrDefault(false)
      val targetFieldsValid = if (protocolVersion >= 2) trackerId != null && UUID_V7.matches(trackerId) && generation != null && generation >= 0 && validDate
        else trackerId == null && membershipId == null && generation == null
      if (id != requestId || !UUID_V7.matches(id) || accountId.isBlank() || accountId != store.boundAccount() || sourceNodeId.isBlank() || sourceNodeId != store.boundNode() || durationMs !in 1..15000 || recordedAt.length !in 20..35 || runCatching { java.time.Instant.parse(recordedAt) }.isFailure || mimeType != "audio/mp4" || protocolVersion !in 1..2 || !targetFieldsValid) {
        return
      }
      val asset = map.getAsset("audio") ?: throw IllegalArgumentException("audio_missing")
      val fd = Tasks.await(Wearable.getDataClient(this).getFdForAsset(asset))
      val envelope = fd.inputStream.use { input ->
        val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192); var total = 0; var count: Int
        while (input.read(buffer).also { count = it } != -1) { total += count; require(total <= 1_572_864) { "asset_too_large" }; out.write(buffer, 0, count) }
        out.toByteArray()
      }
      val clearAudio = store.decryptWearEnvelope(envelope)
      val meta = WatchAudioRequest(id, accountId, recordedAt, mimeType, "pending", durationMs, null, sourceNodeId,
        resolvedTrackerId, resolvedMembershipId, resolvedGeneration, localDate, protocolVersion)
      val inserted = store.insert(meta, clearAudio)
      if (inserted) {
        sendAck(sourceNodeId, id, accountId, "accepted", null)
        WorkManager.getInstance(this).enqueueUniqueWork("watch-audio-handoff-$id", ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<WatchAudioHandoffWorker>().build())
        WatchAudioBridgeModule.notifyQueueChanged(applicationContext)
      } else sendAck(sourceNodeId, id, accountId, "accepted", null)
    } catch (_: Exception) { /* Keep the watch copy; only durable terminal states are acknowledged. */ }
  }

  override fun onMessageReceived(event: MessageEvent) {
    if (event.path != "/unfancy/watch/setup/request" && event.path != "/unfancy/watch/setup") return
    executor.execute {
      try {
        val requestedProtocol = if (event.path == "/unfancy/watch/setup/request") {
          store.pinNode(event.sourceNodeId)
          runCatching { org.json.JSONObject(String(event.data, Charsets.UTF_8)).optInt("protocol", 1) }.getOrDefault(1).coerceIn(1, 2)
        } else 2
        val account = store.boundAccount()
        val publicKey = store.setupPublicKey(event.sourceNodeId)
        val response = setupPayload(account, publicKey, requestedProtocol, store.targets())
        sendMessage(event.sourceNodeId, "/unfancy/watch/setup", response.toString().toByteArray(Charsets.UTF_8))
      } catch (_: Exception) { }
    }
  }

  private fun sendAck(nodeId: String, requestId: String, accountId: String, status: String, code: String?) {
    val json = org.json.JSONObject().put("requestId", requestId).put("accountId", accountId).put("status", status)
    store.find(requestId)?.let { request ->
      request.trackerId?.let { json.put("trackerId", it) }
      request.membershipId?.let { json.put("membershipId", it) }
      request.generation?.let { json.put("generation", it) }
    }
    if (code != null) json.put("code", code)
    val originalNode = store.find(requestId)?.sourceNodeId ?: store.boundNode()
    if (nodeId.isNotBlank() && nodeId == originalNode) sendMessage(nodeId, "/unfancy/watch/ack", json.toString().toByteArray(Charsets.UTF_8))
  }
  private fun sendMessage(nodeId: String, path: String, bytes: ByteArray) {
    try { Wearable.getMessageClient(this).sendMessage(nodeId, path, bytes) } catch (_: Exception) { }
  }
  override fun onDestroy() { executor.shutdown(); super.onDestroy() }
  companion object {
    private fun setupPayload(accountId: String?, publicKey: String?, protocol: Int, targets: List<PhoneWatchTarget>) =
      org.json.JSONObject().put("protocol", protocol).put("accountId", accountId ?: "")
        .put("encryption", if (publicKey == null) org.json.JSONObject.NULL else org.json.JSONObject().put("version", 1).put("algorithm", "RSA-OAEP-256+A256GCM").put("publicKey", publicKey))
        .apply { if (protocol >= 2) put("targets", org.json.JSONArray().apply {
          targets.forEach { target -> put(org.json.JSONObject().put("datasetId", target.datasetId).put("name", target.name)
            .put("membershipId", target.membershipId ?: org.json.JSONObject.NULL).put("generation", target.generation).put("kind", target.kind)) }
        }) }
    fun sendTerminalAck(context: android.content.Context, requestId: String, accountId: String, status: String, code: String?) {
      val req = OneTimeWorkRequestBuilder<WatchAudioAckWorker>().setInputData(androidx.work.workDataOf(WatchAudioAckWorker.KEY_REQUEST_ID to requestId)).build()
      WorkManager.getInstance(context).enqueueUniqueWork("watch-audio-ack-$requestId", ExistingWorkPolicy.REPLACE, req)
    }
    fun syncSetup(context: android.content.Context, accountId: String?) {
      val store = WatchAudioStore(context.applicationContext)
      val normalizedAccount = accountId?.takeIf { it.isNotBlank() }
      store.bind(normalizedAccount)
      val node = store.boundNode() ?: return
      val publicKey = normalizedAccount?.let { store.setupPublicKey(node) }
      val json = setupPayload(normalizedAccount, publicKey, 2, store.targets())
      Wearable.getMessageClient(context).sendMessage(node, "/unfancy/watch/setup", json.toString().toByteArray(Charsets.UTF_8))
    }
    private val UUID_V7 = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$") }
}

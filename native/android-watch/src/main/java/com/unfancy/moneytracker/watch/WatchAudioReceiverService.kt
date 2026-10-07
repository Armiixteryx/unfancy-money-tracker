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
      if (id != requestId || !UUID_V7.matches(id) || sourceNodeId.isBlank()) return
      val existing = store.find(id)
      if (existing != null) {
        if (existing.accountId != accountId || existing.sourceNodeId != sourceNodeId) return
        if (WatchQueuePolicy.isTerminal(existing.status)) sendAck(sourceNodeId, id, existing.accountId, existing.status, existing.errorCode)
        else {
          sendAck(sourceNodeId, id, existing.accountId, "accepted", null)
          WorkManager.getInstance(this).enqueueUniqueWork("watch-audio-handoff-$id", ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<WatchAudioHandoffWorker>().build())
        }
        return
      }
      if (id != requestId || !UUID_V7.matches(id) || accountId.isBlank() || accountId != store.boundAccount() || sourceNodeId.isBlank() || sourceNodeId != store.boundNode() || durationMs !in 1..15000 || recordedAt.length !in 20..35 || runCatching { java.time.Instant.parse(recordedAt) }.isFailure || mimeType != "audio/mp4") {
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
      val inserted = store.insert(WatchAudioRequest(id, accountId, recordedAt, mimeType, "pending", durationMs, null, sourceNodeId), clearAudio)
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
        if (event.path == "/unfancy/watch/setup/request") { store.pinNode(event.sourceNodeId) }
        val account = store.boundAccount()
        val publicKey = store.setupPublicKey(event.sourceNodeId)
        val response = org.json.JSONObject().put("accountId", account ?: "").put("encryption", if (publicKey == null) org.json.JSONObject.NULL else org.json.JSONObject().put("version", 1).put("algorithm", "RSA-OAEP-256+A256GCM").put("publicKey", publicKey))
        sendMessage(event.sourceNodeId, "/unfancy/watch/setup", response.toString().toByteArray(Charsets.UTF_8))
      } catch (_: Exception) { }
    }
  }

  private fun sendAck(nodeId: String, requestId: String, accountId: String, status: String, code: String?) {
    val json = org.json.JSONObject().put("requestId", requestId).put("accountId", accountId).put("status", status)
    if (code != null) json.put("code", code)
    val originalNode = store.find(requestId)?.sourceNodeId ?: store.boundNode()
    if (nodeId.isNotBlank() && nodeId == originalNode) sendMessage(nodeId, "/unfancy/watch/ack", json.toString().toByteArray(Charsets.UTF_8))
  }
  private fun sendMessage(nodeId: String, path: String, bytes: ByteArray) {
    try { Wearable.getMessageClient(this).sendMessage(nodeId, path, bytes) } catch (_: Exception) { }
  }
  override fun onDestroy() { executor.shutdown(); super.onDestroy() }
  companion object {
    fun sendTerminalAck(context: android.content.Context, requestId: String, accountId: String, status: String, code: String?) {
      val req = OneTimeWorkRequestBuilder<WatchAudioAckWorker>().setInputData(androidx.work.workDataOf(WatchAudioAckWorker.KEY_REQUEST_ID to requestId)).build()
      WorkManager.getInstance(context).enqueueUniqueWork("watch-audio-ack-$requestId", ExistingWorkPolicy.REPLACE, req)
    }
    fun syncSetup(context: android.content.Context, accountId: String?) {
      val store = WatchAudioStore(context.applicationContext)
      val normalizedAccount = accountId?.takeIf { it.isNotBlank() }
      store.bind(normalizedAccount)
      val node = store.boundNode() ?: return
      val json = if (normalizedAccount == null) {
        org.json.JSONObject().put("accountId", "").put("encryption", org.json.JSONObject.NULL)
      } else {
        val publicKey = store.setupPublicKey(node) ?: return
        org.json.JSONObject().put("accountId", normalizedAccount).put("encryption", org.json.JSONObject().put("version", 1).put("algorithm", "RSA-OAEP-256+A256GCM").put("publicKey", publicKey))
      }
      Wearable.getMessageClient(context).sendMessage(node, "/unfancy/watch/setup", json.toString().toByteArray(Charsets.UTF_8))
    }
    private val UUID_V7 = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$") }
}

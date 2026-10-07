package com.unfancy.moneytracker.watch

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Replays a persisted terminal receipt until the Wear MessageClient accepts it. */
class WatchAudioAckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val requestId = inputData.getString(KEY_REQUEST_ID) ?: return Result.failure()
    return try {
      val store = WatchAudioStore(applicationContext)
      val request = store.find(requestId) ?: return Result.failure()
      if (request.status !in setOf("completed", "failed", "deleted")) return Result.success()
      if (request.status == "completed" || request.status == "deleted") store.cleanupTerminalAudio(requestId)
      if (request.sourceNodeId.isBlank()) return Result.retry()
      val ack = JSONObject().put("requestId", request.requestId).put("accountId", request.accountId).put("status", request.status)
      request.errorCode?.let { ack.put("code", it) }
      Tasks.await(Wearable.getMessageClient(applicationContext).sendMessage(request.sourceNodeId, "/unfancy/watch/ack", ack.toString().toByteArray(Charsets.UTF_8)), 20, TimeUnit.SECONDS)
      Result.success()
    } catch (_: Exception) { Result.retry() }
  }
  companion object { const val KEY_REQUEST_ID = "requestId" }
}

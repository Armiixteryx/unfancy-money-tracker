package com.unfancy.moneytracker.watch

import android.content.Context
import android.media.MediaPlayer
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.ReactPackage
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager
import java.io.File

class WatchAudioBridgeModule(private val app: ReactApplicationContext) : ReactContextBaseJavaModule(app) {
  private val store = WatchAudioStore(app)
  private var player: MediaPlayer? = null
  override fun getName() = "WatchAudioBridge"

  init {
    try { store.list().filter { WatchQueuePolicy.isTerminal(it.status) }.forEach { WatchAudioReceiverService.sendTerminalAck(app, it.requestId, it.accountId, it.status, it.errorCode) } }
    catch (_: Exception) { /* Leave unreadable encrypted files intact; manual app use must remain available. */ }
  }


  @ReactMethod fun setAccount(accountId: String?, promise: Promise) = guarded(promise) {
    val normalized = accountId?.takeIf { it.isNotBlank() }
    val previous = store.boundAccount()
    if (previous == normalized) { promise.resolve(null); return@guarded }
    if (previous != null) store.failPendingForCurrentBinding("account_changed").forEach { WatchAudioReceiverService.sendTerminalAck(app, it.requestId, it.accountId, "failed", it.errorCode) }
    store.bind(normalized)
    stopPlayer("paused")
    WatchAudioReceiverService.syncSetup(app, normalized)
    emitQueueChanged(); promise.resolve(null)
  }

  @ReactMethod fun setTargets(targetsJson: String, promise: Promise) = guarded(promise) {
    val rows = org.json.JSONArray(targetsJson)
    require(rows.length() <= 128)
    val targets = (0 until rows.length()).map { index ->
      val row = rows.getJSONObject(index)
      val datasetId = row.getString("datasetId"); val name = row.getString("name")
      val membershipId = if (row.isNull("membershipId")) null else row.getString("membershipId")
      val generation = row.getLong("generation"); val kind = row.getString("kind")
      require(UUID_V7.matches(datasetId) && (membershipId == null || UUID_V7.matches(membershipId)))
      require(name.isNotBlank() && name.length <= 80 && generation >= 0 && kind in setOf("personal", "shared"))
      require((kind == "personal") == (membershipId == null))
      PhoneWatchTarget(datasetId, name, membershipId, generation, kind)
    }
    require(targets.map { it.datasetId }.distinct().size == targets.size)
    store.setTargets(targets)
    store.boundAccount()?.let { WatchAudioReceiverService.syncSetup(app, it) }
    promise.resolve(null)
  }

  @ReactMethod fun bindLegacyPersonalTarget(requestId: String, accountId: String, datasetId: String, generation: Double, promise: Promise) = guarded(promise) {
    val target = store.targets().firstOrNull { it.datasetId == datasetId && it.kind == "personal" } ?: error("personal_target_unavailable")
    require(target.generation == generation.toLong()) { "target_generation_changed" }
    check(store.bindLegacyPersonalTarget(requestId, accountId, target)) { "legacy_target_binding_failed" }
    promise.resolve(null)
  }

  @ReactMethod fun failPendingForCurrentBinding(code: String, promise: Promise) = guarded(promise) {
    val failed = store.failPendingForCurrentBinding(code, includeProcessing = code != "handoff_failed")
    failed.forEach { WatchAudioReceiverService.sendTerminalAck(app, it.requestId, it.accountId, "failed", it.errorCode) }
    if (failed.isNotEmpty()) emitQueueChanged()
    promise.resolve(null)
  }

  @ReactMethod fun getPending(promise: Promise) = guarded(promise) {
    val account = store.boundAccount()
    val arr = Arguments.createArray()
    store.list().filter { it.status == "pending" && it.accountId == account }.forEach { arr.pushMap(toMap(it)) }
    promise.resolve(arr)
  }

  @ReactMethod fun list(promise: Promise) = guarded(promise) {
    val arr = Arguments.createArray()
    store.list().filter { it.status == "failed" || it.status == "completed" || it.status == "processing" }.forEach { arr.pushMap(toMap(it)) }
    promise.resolve(arr)
  }

  @ReactMethod fun readAudio(requestId: String, promise: Promise) = guarded(promise) {
    val req = store.find(requestId) ?: error("record_missing")
    require(req.accountId == store.boundAccount()) { "account_mismatch" }
    val map = Arguments.createMap().apply {
      putString("audio", Base64.encodeToString(store.read(requestId), Base64.NO_WRAP))
      putString("mimeType", req.mimeType)
      putDouble("durationMs", req.durationMs?.toDouble() ?: 0.0)
    }
    promise.resolve(map)
  }

  @ReactMethod fun markProcessing(requestId: String, trackerId: String?, membershipId: String?, generation: Double?, promise: Promise) = guarded(promise) {
    val req = store.find(requestId)
    val ok = req != null && matchesTarget(req, trackerId, membershipId, generation) && store.claimPending(requestId, store.boundAccount().orEmpty())
    promise.resolve(ok)
    if (ok) emitQueueChanged()
  }

  @ReactMethod fun markSucceeded(requestId: String, transactionId: String, trackerId: String?, membershipId: String?, generation: Double?, promise: Promise) = guarded(promise) {
    require(transactionId == requestId) { "transaction_id_required" }
    val req = store.find(requestId) ?: error("record_missing")
    require(req.accountId == store.boundAccount()) { "account_mismatch" }
    require(matchesTarget(req, trackerId, membershipId, generation)) { "target_mismatch" }
    require(WatchQueuePolicy.canMarkCompleted(req.status)) { "invalid_terminal_transition" }
    check(store.markCompleted(requestId)) { "record_missing" }
    WatchAudioReceiverService.sendTerminalAck(app, requestId, req.accountId, "completed", null)
    emitQueueChanged(); promise.resolve(null)
  }

  @ReactMethod fun markFailed(requestId: String, code: String, trackerId: String?, membershipId: String?, generation: Double?, promise: Promise) = guarded(promise) {
    val safeCode = code.takeIf { it.matches(Regex("^[a-z0-9_]{1,48}$")) } ?: "processing_failed"
    val req = store.find(requestId) ?: error("record_missing")
    require(req.accountId == store.boundAccount()) { "account_mismatch" }
    require(matchesTarget(req, trackerId, membershipId, generation)) { "target_mismatch" }
    // Failure changes queue metadata only and never exposes audio, so a session change can safely close an old claim.
    check(store.update(requestId, "failed", safeCode)) { "record_missing" }
    WatchAudioReceiverService.sendTerminalAck(app, requestId, req.accountId, "failed", safeCode)
    emitQueueChanged(); promise.resolve(null)
  }

  @ReactMethod fun delete(requestId: String, promise: Promise) = guarded(promise) {
    val req = store.find(requestId)
    if (playingRequestId == requestId) stopPlayer("paused")
    val result = store.remove(requestId)
    if (req != null) WatchAudioReceiverService.sendTerminalAck(app, requestId, req.accountId, "deleted", null)
    emitQueueChanged(); promise.resolve(result)
  }

  @ReactMethod fun play(requestId: String, promise: Promise) = guarded(promise) {
    val req = store.find(requestId) ?: error("record_missing")
    require(WatchQueuePolicy.canPlay(req.status, req.accountId, store.boundAccount())) { "account_or_status_mismatch" }
    stopPlayer("paused")
    val clear = store.read(requestId)
    playingRequestId = requestId
    player = MediaPlayer().apply {
      setDataSource(object : android.media.MediaDataSource() {
        override fun getSize() = clear.size.toLong()
        override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
          if (position >= clear.size) return -1
          val count = minOf(size, clear.size - position.toInt()); System.arraycopy(clear, position.toInt(), buffer, offset, count); return count
        }
        override fun close() { clear.fill(0) }
      })
      setOnCompletionListener { it.release(); player = null; playingRequestId = null; emitPlayback(requestId, "completed") }
      setOnErrorListener { mp, _, _ -> mp.release(); player = null; playingRequestId = null; emitPlayback(requestId, "paused"); true }
      prepare(); start()
    }
    promise.resolve(null)
  }

  @ReactMethod fun pause(requestId: String, promise: Promise) = guarded(promise) { stopPlayer("paused"); promise.resolve(null) }
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  private fun pausePlayer() { try { player?.pause(); player?.release() } catch (_: Exception) { }; player = null }
  private fun stopPlayer(status: String) { val id = playingRequestId; pausePlayer(); if (id != null) emitPlayback(id, status); playingRequestId = null }
  private var playingRequestId: String? = null
  private fun emitPlayback(id: String, status: String) {
    if (app.hasActiveReactInstance()) app.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("WatchAudioPlaybackChanged", Arguments.createMap().apply { putString("requestId", id); putString("status", status) })
  }
  private fun toMap(r: WatchAudioRequest) = Arguments.createMap().apply {
    putString("requestId", r.requestId); putString("accountId", r.accountId); putString("recordedAt", r.recordedAt)
    putString("mimeType", r.mimeType); putString("status", r.status); r.durationMs?.let { putDouble("durationMs", it.toDouble()) }; r.errorCode?.let { putString("errorCode", it) }
    r.trackerId?.let { putString("trackerId", it) }; r.membershipId?.let { putString("membershipId", it) }
    r.generation?.let { putDouble("generation", it.toDouble()) }; r.localDate?.let { putString("localDate", it) }
    putInt("protocolVersion", r.protocolVersion)
  }
  private fun matchesTarget(req: WatchAudioRequest, trackerId: String?, membershipId: String?, generation: Double?): Boolean =
    req.trackerId == trackerId && req.membershipId == membershipId && req.generation == generation?.toLong()
  private fun emitQueueChanged() {
    if (app.hasActiveReactInstance()) app.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("WatchAudioQueueChanged", null)
  }
  private inline fun guarded(promise: Promise, block: () -> Unit) { try { block() } catch (_: Exception) { promise.reject("watch_audio_error", "The watch audio action could not be completed.") } }
  override fun invalidate() { stopPlayer("paused"); super.invalidate() }

  companion object {
    private val UUID_V7 = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    fun notifyQueueChanged(context: Context) {
      val reactApp = context.applicationContext as? ReactApplication ?: return
      val reactContext = reactApp.reactHost?.currentReactContext ?: return
      if (reactContext.hasActiveReactInstance()) reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("WatchAudioQueueChanged", null)
    }
  }
}

class WatchAudioBridgePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(WatchAudioBridgeModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

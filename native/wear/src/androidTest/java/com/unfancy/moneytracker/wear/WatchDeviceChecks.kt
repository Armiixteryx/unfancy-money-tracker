package com.unfancy.moneytracker.wear

import android.app.Instrumentation
import android.os.Bundle
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

/** Paired-device setup probe. Reports no account IDs, node IDs, audio, or financial data. */
class WatchDeviceChecks : Instrumentation() {
    private var arguments = Bundle()
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); this.arguments = arguments ?: Bundle(); start() }
    override fun onStart() {
        val result = Bundle()
        try {
            runBlocking {
                val action = arguments.getString("action") ?: "setup"
                if (action == "verifyUnbound") { verifyUnbound(result); return@runBlocking }
                if (action != "setup") { runQueueAction(action, result); return@runBlocking }
                result.putString("stage", "query_connected_nodes"); sendStatus(1, result)
                val nodes = withTimeout(10000) { Wearable.getNodeClient(targetContext).connectedNodes.await() }
                result.putInt("connectedPhoneCount", nodes.size)
                val transport = WatchTransport(targetContext)
                result.putString("stage", "request_setup"); sendStatus(1, result)
                val replyObserved = java.util.concurrent.atomic.AtomicBoolean(false)
                val listener = com.google.android.gms.wearable.MessageClient.OnMessageReceivedListener { event ->
                    if (event.path == WatchTransport.SETUP_PATH) replyObserved.set(true)
                }
                withTimeout(10000) { Wearable.getMessageClient(targetContext).addListener(listener).await() }
                for (node in nodes) {
                    try {
                        withTimeout(10000) { Wearable.getMessageClient(targetContext).sendMessage(node.id, WatchTransport.SETUP_REQUEST_PATH, "{\"protocol\":1}".toByteArray()).await() }
                        result.putBoolean("setupMessageAccepted", true)
                    } catch (error: com.google.android.gms.common.api.ApiException) {
                        result.putInt("setupApiStatus", error.statusCode)
                    } catch (_: Exception) { result.putString("outcome", "setup_message_timeout") }
                }
                sendStatus(1, result)
                repeat(20) {
                    if (!replyObserved.get() || transport.binding() == null) delay(1000)
                }
                result.putBoolean("setupReplyObserved", replyObserved.get())
                withTimeout(10000) { Wearable.getMessageClient(targetContext).removeListener(listener).await() }
                result.putBoolean("signedInBindingReceived", transport.binding() != null)
                result.putBoolean("encryptedQueueAvailable", EncryptedQueue(targetContext).available())
                // Use the real AndroidKeyStore key with isolated memory-backed test storage.
                val memory = object : DurableQueueFile {
                    var bytes: ByteArray? = null
                    override fun read() = bytes
                    override fun write(bytes: ByteArray): Boolean { this.bytes = bytes; return true }
                }
                val queue = EncryptedQueue(targetContext, memory)
                val synthetic = byteArrayOf(1, 2, 3)
                val record = Recording(newRequestId(), "synthetic-account", "synthetic-node", "2026-10-06T12:00:00Z", 1000, "audio/mp4", synthetic)
                val saved = queue.add(record)
                val reopened = EncryptedQueue(targetContext, memory)
                result.putBoolean("keystoreQueueRoundTrip", saved && reopened.list().singleOrNull()?.audio?.contentEquals(synthetic) == true)
                repeat(9) { check(queue.add(record.copy(requestId = newRequestId()))) }
                result.putBoolean("tenItemLimit", queue.size() == 10 && !queue.add(record.copy(requestId = newRequestId())))
                val persisted = memory.bytes?.copyOf()
                memory.bytes = byteArrayOf(1, 2, 3)
                val corrupt = EncryptedQueue(targetContext, memory)
                result.putBoolean("corruptionRetained", !corrupt.available() && !corrupt.add(record) && memory.bytes?.contentEquals(byteArrayOf(1, 2, 3)) == true)
                memory.bytes = persisted
                result.putBoolean("queueReopened", EncryptedQueue(targetContext, memory).size() == 10)
                check(result.getBoolean("tenItemLimit"))
                check(result.getBoolean("corruptionRetained"))
                check(result.getBoolean("queueReopened"))
                check(result.getBoolean("keystoreQueueRoundTrip"))
                check(result.getBoolean("signedInBindingReceived"))
                check(result.getBoolean("setupReplyObserved"))
            }
            finish(android.app.Activity.RESULT_OK, result)
        } catch (_: Exception) {
            result.putString("outcome", "device_check_failed")
            finish(android.app.Activity.RESULT_CANCELED, result)
        }
    }
    private suspend fun verifyUnbound(result: Bundle) {
        result.putString("stage", "snapshot_binding_and_queue")
        val context = targetContext
        val bindingFile = java.io.File(context.noBackupFilesDir, "watch-binding.enc")
        val bindingBackup = bindingFile.takeIf { it.exists() }?.readBytes()
        val store = EncryptedBindingStore(context)
        val beforeQueue = EncryptedQueue(context).list().map { it.requestId }
        val beforeAudioFiles = audioFileNames(context)
        var activity: MainActivity? = null
        try {
            check(store.read() != null)
            result.putString("stage", "clear_binding")
            store.save(null)
            check(WatchTransport(context).binding() == null)
            result.putString("stage", "launch_unbound_activity")
            try {
                activity = startActivitySync(android.content.Intent(context, MainActivity::class.java)
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
            } catch (error: Exception) {
                result.putString("launchFailure", error.javaClass.simpleName)
                throw error
            }
            delay(1000)
            result.putString("stage", "assert_record_disabled")
            val ready = activity!!.getPrivateField("phoneReady") as? Boolean ?: error("watch_ui_state_unavailable")
            check(!ready)
            result.putString("stage", "invoke_record_guard")
            runOnMainSync { activity!!.invokePrivate("startRecording") }
            result.putString("stage", "setup_request_without_companion")
            val connectedPhoneCount = withTimeout(10000) { Wearable.getNodeClient(context).connectedNodes.await().size }
            result.putInt("connectedPhoneCount", connectedPhoneCount)
            WatchTransport(context).requestSetup()
            delay(3000)
            check(WatchTransport(context).binding() == null)
            result.putString("stage", "assert_queue_unchanged")
            val recording = activity!!.getPrivateField("recording") as? Boolean ?: error("watch_recording_state_unavailable")
            val requestId = activity!!.getPrivateField("requestId")
            check(!recording && requestId == null)
            check(audioFileNames(context) == beforeAudioFiles)
            check(EncryptedQueue(context).list().map { it.requestId } == beforeQueue)
            result.putBoolean("bindingAbsent", true)
            result.putBoolean("recordControlGuardDisabled", !ready)
            result.putBoolean("microphoneStartBlocked", true)
            result.putBoolean("setupRequestRemainedUnbound", true)
            result.putBoolean("queueUnchanged", true)
            result.putInt("caseIndex", 1)
        } finally {
            activity?.let { runOnMainSync { it.finish() } }
            if (bindingBackup == null) {
                android.util.AtomicFile(bindingFile).delete()
            } else {
                val atomic = android.util.AtomicFile(bindingFile)
                val output = atomic.startWrite()
                try { output.write(bindingBackup); atomic.finishWrite(output) }
                catch (error: Exception) { atomic.failWrite(output); throw error }
            }
            check(store.read() != null)
            check(EncryptedQueue(context).list().map { it.requestId } == beforeQueue)
            check(audioFileNames(context) == beforeAudioFiles)
            result.putBoolean("bindingRestored", true)
        }
    }

    private fun Any.getPrivateField(name: String): Any? {
        val field = runCatching { javaClass.getDeclaredField(name) }.getOrElse { javaClass.getDeclaredField("${name}\$delegate") }
        field.isAccessible = true
        val stored = field.get(this)
        return if (stored is androidx.compose.runtime.MutableState<*>) stored.value else stored
    }
    private fun Any.invokePrivate(name: String) = javaClass.getDeclaredMethod(name).run { isAccessible = true; invoke(this@invokePrivate) }
    private fun audioFileNames(context: android.content.Context) = context.cacheDir.listFiles()
        .orEmpty().filter { it.name.endsWith(".m4a") }.map { it.name }.toSet()

    private suspend fun runQueueAction(action: String, result: Bundle) {
        val transport = WatchTransport(targetContext)
        val queue = EncryptedQueue(targetContext)
        val backupFile = android.util.AtomicFile(java.io.File(targetContext.noBackupFilesDir, "synthetic-test-recordings.enc"))
        val backup = EncryptedQueue(targetContext, object : DurableQueueFile {
            override fun read(): ByteArray? = if (backupFile.baseFile.exists()) backupFile.openRead().use { it.readBytes() } else null
            override fun write(bytes: ByteArray): Boolean {
                val output = backupFile.startWrite()
                return try { output.write(bytes); backupFile.finishWrite(output); true }
                catch (_: Exception) { backupFile.failWrite(output); false }
            }
        })
        when (action) {
            "enqueue" -> {
                val phone = checkNotNull(transport.binding())
                val fixture = arguments.getString("fixture") ?: "silence"
                check(fixture in setOf("silence", "expense"))
                val count = (arguments.getString("count") ?: "1").toInt()
                check(count in 1..10)
                val audio = context.assets.open("synthetic-$fixture.m4a").use { it.readBytes() }
                while (backup.size() + count > QueuePolicy.MAX_ITEMS) check(backup.remove(backup.list().first().requestId))
                repeat(count) {
                    val record = Recording(newRequestId(), phone.accountId, phone.nodeId, java.time.Instant.now().toString(),
                        if (fixture == "expense") 2400 else 2000, "audio/mp4", audio)
                    check(backup.add(record)); check(queue.add(record))
                }
                if (arguments.getString("transfer") != "false") withTimeout(15000) { transport.transferPending() }
                result.putString("outcome", "synthetic_enqueued")
            }
            "resend" -> {
                val records = backup.list()
                val index = arguments.getString("backupIndex")?.toInt() ?: records.lastIndex
                val record = checkNotNull(records.getOrNull(index))
                if (queue.list().none { it.requestId == record.requestId }) check(queue.add(record))
                withTimeout(15000) { transport.transferPending() }
                result.putString("outcome", "synthetic_redelivered")
            }
            "transfer" -> {
                withTimeout(15000) { transport.transferPending() }
                result.putString("outcome", "transfer_requested")
            }
            "verifyDrained" -> {
                check(queue.available()); check(queue.size() == 0)
                result.putString("outcome", "terminal_receipts_drained_watch")
            }
            "verifyTen" -> {
                check(queue.available()); check(queue.size() == 10)
                val last = checkNotNull(queue.list().lastOrNull())
                check(!queue.add(last.copy(requestId = newRequestId())))
                result.putString("outcome", "ten_pending_eleventh_blocked")
            }
            "cleanup" -> {
                check(queue.size() == 0)
                backupFile.delete()
                result.putString("outcome", "synthetic_backup_deleted")
            }
            else -> error("unsupported_test_action")
        }
        result.putInt("caseIndex", (arguments.getString("caseIndex") ?: "0").toInt())
    }

}

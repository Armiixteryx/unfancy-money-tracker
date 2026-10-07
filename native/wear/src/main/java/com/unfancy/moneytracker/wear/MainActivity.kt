package com.unfancy.moneytracker.wear

import android.Manifest
import android.content.pm.PackageManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.MediaRecorder
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.File
import java.time.Instant

class MainActivity : ComponentActivity() {
    private val queue by lazy { EncryptedQueue(this) }
    private val transport by lazy { WatchTransport(this) }
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private var stopTimer: Job? = null
    private var recording by mutableStateOf(false)
    private var queueSize by mutableStateOf(0)
    private var queueAvailable by mutableStateOf(true)
    private var phoneReady by mutableStateOf(false)
    private var phoneConnected by mutableStateOf(false)
    private var message by mutableStateOf(0)
    private var requestId: String? = null
    private var recordingBinding: PhoneBinding? = null
    private var startedAtMs = 0L
    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { refresh() }
    }

    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startRecording() else message = R.string.status_permission
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                if (watchScreenMode(phoneReady) == WatchScreenMode.Setup) {
                    Box(
                        modifier = Modifier.fillMaxSize().background(Color(0xFF101E33)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 28.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            Text(stringResource(R.string.watch_title), fontSize = 18.sp, color = Color(0xFF63D9A0))
                            PhoneSetupIcon()
                            Text(
                                stringResource(R.string.status_sign_in),
                                fontSize = 14.sp,
                                lineHeight = 19.sp,
                                color = Color(0xFFE6EDF5),
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                } else {
                    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(Color(0xFF101E33)), horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            autoCentering = null, contentPadding = PaddingValues(horizontal = 22.dp, vertical = 24.dp)) {
                            item { Text(stringResource(R.string.watch_title), fontSize = 18.sp, color = Color(0xFF63D9A0)) }
                            item { Text(stringResource(message.takeIf { it != 0 } ?: R.string.status_start), fontSize = 14.sp, color = Color(0xFFE6EDF5), textAlign = TextAlign.Center) }
                            item { Text(stringResource(R.string.queue_count, queueSize, QueuePolicy.MAX_ITEMS), fontSize = 12.sp, color = Color(0xFFE6EDF5)) }
                            item { Button(onClick = {
                                if (recording) stopRecording() else if (queueSize >= QueuePolicy.MAX_ITEMS) {
                                    message = R.string.status_full
                                } else if (!queueAvailable) message = R.string.status_recovery
                                else if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startRecording()
                                else permission.launch(Manifest.permission.RECORD_AUDIO)
                            }, enabled = recording || (queueAvailable && queueSize < QueuePolicy.MAX_ITEMS), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16734F), contentColor = Color.White)) {
                                Text(stringResource(if (recording) R.string.stop else R.string.record), fontSize = 14.sp)
                            } }
                            if (queueSize > 0) item { Button(onClick = { lifecycleScope.launch { transport.transferPending(); refresh() } }) { Text(stringResource(R.string.send_to_phone)) } }
                    }
                }
            }
        }
        ContextCompat.registerReceiver(this, stateReceiver, IntentFilter(WatchTransport.STATE_CHANGED_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED)
        refresh()
    }

    override fun onResume() { super.onResume(); lifecycleScope.launch { transport.requestSetup() }; refresh() }

    override fun onStop() {
        if (recording) cancelRecording()
        super.onStop()
    }

    private fun refresh() {
        lifecycleScope.launch {
            queueSize = queue.size()
            queueAvailable = queue.available()
            val binding = transport.binding()
            phoneReady = binding != null
            phoneConnected = binding != null && runCatching { Wearable.getNodeClient(this@MainActivity).connectedNodes.await().any { it.id == binding.nodeId } }.getOrDefault(false)
            if (binding != null && phoneConnected && queueSize > 0) lifecycleScope.launch { transport.transferPending() }
            if (!recording) {
                message = when {
                    !queueAvailable -> R.string.status_recovery
                    binding == null -> if (queueSize > 0) R.string.status_original_account else R.string.status_sign_in
                    queueSize > 0 -> if (phoneConnected) R.string.status_pending else R.string.status_saved_local
                    transport.lastOutcome() == "completed" -> R.string.status_phone_saved
                    transport.lastOutcome() == "failed" -> R.string.status_phone_failed
                    transport.lastOutcome() == "deleted" -> R.string.status_phone_deleted
                    !phoneConnected -> R.string.status_offline
                    else -> R.string.status_ready
                }
            }
        }
    }

    private fun startRecording() {
        if (recording || queue.size() >= QueuePolicy.MAX_ITEMS) return
        recordingBinding = transport.binding()
        if (recordingBinding == null) { message = R.string.status_sign_in; return }
        try {
            requestId = newRequestId()
            val output = File(cacheDir, "$requestId.m4a")
            transport.clearOutcome()
            val audioRecorder = MediaRecorder(this).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(64_000)
                setAudioSamplingRate(22_050)
                setMaxDuration(QueuePolicy.MAX_RECORDING_MS.toInt())
                setOutputFile(output.absolutePath)
                setOnInfoListener { _, what, _ -> if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) stopRecording() }
                prepare()
                start()
            }
            recordingFile = output
            recorder = audioRecorder
            recording = true
            startedAtMs = SystemClock.elapsedRealtime()
            message = R.string.status_recording
            stopTimer = lifecycleScope.launch { delay(QueuePolicy.MAX_RECORDING_MS); stopRecording() }
        } catch (_: Exception) { releaseRecorder(); message = R.string.status_record_failed }
    }

    private fun stopRecording() {
        if (!recording) return
        stopTimer?.cancel()
        try {
            recorder?.stop()
            val file = recordingFile
            val binding = recordingBinding
            if (file != null && file.exists() && file.length() > 0 && binding != null) {
                val duration = (SystemClock.elapsedRealtime() - startedAtMs).coerceIn(1L, QueuePolicy.MAX_RECORDING_MS)
                if (!QueuePolicy.validDuration(duration)) {
                    message = R.string.status_too_short
                    return
                }
                val saved = queue.add(Recording(requestId ?: newRequestId(), binding.accountId, binding.nodeId,
                    Instant.now().toString(), duration, "audio/mp4", file.readBytes()))
                if (saved) {
                    message = if (phoneConnected) R.string.status_saved else R.string.status_saved_local
                    lifecycleScope.launch { transport.transferPending(); refresh() }
                } else message = R.string.status_save_failed
            } else message = R.string.status_unavailable
        } catch (_: Exception) { message = R.string.status_save_failed }
        finally { recording = false; recordingBinding = null; requestId = null; releaseRecorder(); recordingFile?.delete(); recordingFile = null; refresh() }
    }

    private fun cancelRecording() {
        stopTimer?.cancel()
        recording = false
        runCatching { recorder?.stop() }
        releaseRecorder()
        recordingFile?.delete()
        recordingFile = null
        recordingBinding = null
        requestId = null
    }

    private fun releaseRecorder() { runCatching { recorder?.reset() }; runCatching { recorder?.release() }; recorder = null }

    override fun onDestroy() {
        runCatching { unregisterReceiver(stateReceiver) }
        stopTimer?.cancel()
        if (recording) runCatching { recorder?.stop() }
        releaseRecorder()
        recordingFile?.delete()
        super.onDestroy()
    }
}

@Composable
private fun PhoneSetupIcon() {
    Canvas(Modifier.size(36.dp)) {
        val stroke = 2.dp.toPx()
        val left = size.width * 0.27f
        val top = size.height * 0.08f
        val width = size.width * 0.46f
        val height = size.height * 0.84f
        drawRoundRect(
            color = Color(0xFF63D9A0),
            topLeft = Offset(left, top),
            size = Size(width, height),
            cornerRadius = CornerRadius(5.dp.toPx()),
            style = Stroke(width = stroke),
        )
        drawLine(Color(0xFF63D9A0), Offset(size.width * 0.43f, top + 4.dp.toPx()), Offset(size.width * 0.57f, top + 4.dp.toPx()), stroke)
        drawCircle(Color(0xFF63D9A0), radius = 1.3.dp.toPx(), center = Offset(size.width / 2, top + height - 4.dp.toPx()))
    }
}

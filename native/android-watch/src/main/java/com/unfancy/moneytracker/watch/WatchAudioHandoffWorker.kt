package com.unfancy.moneytracker.watch

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.TimeUnit

/** Runs the JS queue processor under WorkManager's execution window and wakelock. */
class WatchAudioHandoffWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val reactApp = applicationContext as? ReactApplication ?: return Result.failure()
    return try {
      val host = reactApp.reactHost ?: return Result.retry()
      val start = host.start()
      if (!start.waitForCompletion(60, TimeUnit.SECONDS) || start.isFaulted() || start.isCancelled()) return Result.retry()
      val reactContext = host.currentReactContext ?: return Result.retry()
      val taskContext = HeadlessJsTaskContext.getInstance(reactContext)
      val done = CountDownLatch(1)
      val ownTaskId = AtomicInteger(-1)
      val starting = AtomicBoolean(false)
      val startFailed = AtomicBoolean(false)
      val listener = object : HeadlessJsTaskEventListener {
        override fun onHeadlessJsTaskStart(taskId: Int) { if (starting.get()) ownTaskId.set(taskId) }
        override fun onHeadlessJsTaskFinish(taskId: Int) { if (taskId == ownTaskId.get()) done.countDown() }
      }
      taskContext.addTaskEventListener(listener)
      try {
        UiThreadUtil.runOnUiThread {
          starting.set(true)
          try { ownTaskId.set(taskContext.startTask(HeadlessJsTaskConfig("WatchAudioQueue", Arguments.createMap(), 480_000, true))) }
          catch (_: Exception) { startFailed.set(true); done.countDown() }
          finally { starting.set(false) }
        }
        if (done.await(490, TimeUnit.SECONDS) && !startFailed.get()) Result.success() else Result.retry()
      } finally { taskContext.removeTaskEventListener(listener) }
    } catch (_: InterruptedException) { Thread.currentThread().interrupt(); Result.retry() }
      catch (_: Exception) { Result.retry() }
  }
}

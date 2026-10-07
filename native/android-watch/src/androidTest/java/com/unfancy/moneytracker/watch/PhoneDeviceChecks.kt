package com.unfancy.moneytracker.watch

import android.app.Instrumentation
import android.content.ContextWrapper
import android.os.Bundle
import java.io.File

/** Real Keystore/filesystem fault probes, isolated from all live app records and keys. */
class PhoneDeviceChecks : Instrumentation() {
  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
  override fun onStart() {
    val result = Bundle()
    val root = File(targetContext.noBackupFilesDir, "synthetic-watch-device-probe")
    val context = object : ContextWrapper(targetContext) { override fun getNoBackupFilesDir() = root }
    val underlyingKeys = AndroidWatchAudioKeyProvider()
    val aliases = mutableSetOf<String>()
    val keys = object : WatchAudioKeyProvider {
      var failDelete = false
      override fun get(alias: String): javax.crypto.SecretKey {
        val scoped = "synthetic_device_probe_$alias"; aliases.add(scoped)
        return underlyingKeys.get(scoped)
      }
      override fun delete(alias: String) {
        if (failDelete) error("synthetic_key_failure")
        underlyingKeys.delete("synthetic_device_probe_$alias")
      }
    }
    fun reset() {
      keys.failDelete = false
      check(!root.exists() || root.deleteRecursively())
      aliases.forEach { underlyingKeys.delete(it) }; aliases.clear()
    }
    try {
      val id = "018f47e2-9abc-7def-8abc-123456789012"
      val audio = "synthetic-device-audio".toByteArray()
      val record = WatchAudioRequest(id, "synthetic-account-a", "2026-10-06T12:00:00Z", "audio/mp4", "pending", 2000, null, "synthetic-node")
      fun fixture(): Pair<WatchAudioStore, FaultDisk> {
        reset(); val disk = FaultDisk(AndroidWatchAudioDisk(context)); return WatchAudioStore(disk, keys) to disk
      }
      for (name in listOf("audio:$id", "metadata")) {
        val (store, disk) = fixture(); disk.failWrite = name
        check(runCatching { store.insert(record, audio) }.isFailure)
        check(store.list().isEmpty()); check(disk.read("audio:$id") == null)
      }
      result.putBoolean("inboxWriteFailuresPreserved", true)
      var pair = fixture(); var store = pair.first; var disk = pair.second
      check(store.insert(record, audio)); check(store.read(id).contentEquals(audio))
      check(!disk.read("audio:$id")!!.contentEquals(audio))
      check(!store.claimPending(id, "synthetic-account-b")); check(store.claimPending(id, "synthetic-account-a"))
      disk.failWrite = "metadata"
      check(runCatching { store.update(id, "failed", "processing_failed") }.isFailure)
      check(store.find(id)?.status == "processing"); check(store.read(id).contentEquals(audio))
      check(store.update(id, "failed", "processing_failed")); check(!store.insert(record, audio))
      store.bind("synthetic-account-b", "synthetic-node")
      check(!WatchQueuePolicy.canPlay("failed", "synthetic-account-a", store.boundAccount()))
      store.bind(null); check(store.find(id)?.status == "failed"); check(store.read(id).contentEquals(audio))
      result.putBoolean("failedReceiptAndAccountRetention", true)
      disk.failWrite = "metadata"
      check(runCatching { store.remove(id) }.isFailure); check(store.read(id).contentEquals(audio))
      keys.failDelete = true
      check(runCatching { store.remove(id) }.isFailure); check(store.find(id)?.status == "failed")
      check(store.read(id).contentEquals(audio)); keys.failDelete = false
      disk.failDelete = true
      check(runCatching { store.remove(id) }.isFailure); check(store.find(id)?.status == "deleted")
      check(runCatching { store.read(id) }.isFailure); check(!store.insert(record, audio))
      disk.failDelete = false; store.cleanupTerminalAudio(id); check(disk.read("audio:$id") == null)
      result.putBoolean("deletionFaultsAndTombstone", true)
      pair = fixture(); store = pair.first; disk = pair.second
      check(store.insert(record, audio)); check(store.claimPending(id, record.accountId)); disk.failWrite = "metadata"
      check(runCatching { store.markCompleted(id) }.isFailure); check(store.find(id)?.status == "processing")
      check(store.read(id).contentEquals(audio)); check(store.markCompleted(id))
      check(WatchAudioStore(disk, keys).find(id)?.status == "completed"); check(!store.insert(record, audio))
      result.putBoolean("completionReceiptFaultAndReopen", true)
      pair = fixture(); store = pair.first; disk = pair.second
      check(store.insert(record, audio)); val original = disk.read("metadata")!!
      underlyingKeys.delete("synthetic_device_probe_unfancy_watch_metadata_v1")
      check(runCatching { store.list() }.isFailure); check(disk.read("metadata")!!.contentEquals(original))
      result.putBoolean("unavailableKeyRetainsCiphertext", true)
      result.putString("outcome", "physical_encrypted_storage_faults_passed")
      finish(android.app.Activity.RESULT_OK, result)
    } catch (_: Exception) { result.putString("outcome", "physical_storage_probe_failed"); finish(android.app.Activity.RESULT_CANCELED, result) }
    finally { runCatching { reset() } }
  }
  private class FaultDisk(private val delegate: WatchAudioDisk) : WatchAudioDisk {
    var failWrite: String? = null
    var failDelete = false
    override fun read(name: String) = delegate.read(name)
    override fun writeAtomic(name: String, bytes: ByteArray) {
      if (failWrite == name) { failWrite = null; error("synthetic_write_failure") }
      delegate.writeAtomic(name, bytes)
    }
    override fun delete(name: String) { if (failDelete) error("synthetic_delete_failure"); delegate.delete(name) }
  }
}

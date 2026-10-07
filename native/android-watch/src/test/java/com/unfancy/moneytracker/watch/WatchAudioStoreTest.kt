package com.unfancy.moneytracker.watch

import java.util.concurrent.ConcurrentHashMap
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchAudioStoreTest {
  private val requestId = "018f47e2-9abc-7def-8abc-123456789012"
  private fun record(status: String = "pending", account: String = "account-a") = WatchAudioRequest(
    requestId, account, "2026-10-06T12:34:56Z", "audio/mp4", status, 2_000, null, "watch-node-a"
  )
  private fun fixture() = Fixture().also { it.store.insert(record(), byteArrayOf(1, 2, 3, 4)) }

  @Test fun audioAndMetadataWriteFailureNeverClaimsOrAcknowledgesARecord() {
    val f = Fixture(); f.disk.failNextWrite = "metadata"
    runCatching { f.store.insert(record(), byteArrayOf(1, 2, 3)) }.onSuccess { error("expected metadata failure") }
    assertTrue(f.store.list().isEmpty())
    assertNull(f.disk.read("audio:$requestId"))

    f.disk.failNextWrite = "audio:$requestId"
    runCatching { f.store.insert(record(), byteArrayOf(1, 2, 3)) }.onSuccess { error("expected audio failure") }
    assertTrue(f.store.list().isEmpty())
  }

  @Test fun onlyPendingAudioCanBeClaimedByItsOriginatingAccount() {
    val f = fixture()
    assertFalse(f.store.claimPending(requestId, "account-b"))
    assertTrue(f.store.claimPending(requestId, "account-a"))
    assertFalse(f.store.claimPending(requestId, "account-a"))
    assertEquals("processing", f.store.find(requestId)?.status)
  }

  @Test fun failedAndCompletedReceiptsAreDurableAndDuplicateItemsCannotReinsertAudio() {
    val f = fixture()
    assertTrue(f.store.claimPending(requestId, "account-a"))
    assertTrue(f.store.update(requestId, "failed", "processing_failed"))
    assertTrue(WatchQueuePolicy.isTerminal(f.store.find(requestId)!!.status))
    assertFalse(f.store.insert(record(), byteArrayOf(9, 9, 9)))
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), f.store.read(requestId))

    assertTrue(f.store.markCompleted(requestId))
    assertEquals("completed", f.store.find(requestId)?.status)
    assertNull(f.disk.read("audio:$requestId"))
    assertFalse(f.store.insert(record(), byteArrayOf(8)))
  }

  @Test fun staleFailureCannotOverwriteCompletionOrDeletion() {
    val f = fixture(); assertTrue(f.store.claimPending(requestId, "account-a")); assertTrue(f.store.markCompleted(requestId))
    assertFalse(f.store.update(requestId, "failed", "late_error"))
    assertEquals("completed", f.store.find(requestId)?.status)
    assertTrue(f.store.remove(requestId))
    assertFalse(f.store.update(requestId, "failed", "late_error"))
    assertEquals("deleted", f.store.find(requestId)?.status)
  }

  @Test fun failedCompletionMetadataCommitLeavesProcessingAudioRecoverable() {
    val f = fixture(); assertTrue(f.store.claimPending(requestId, "account-a")); f.disk.failNextWrite = "metadata"
    runCatching { f.store.markCompleted(requestId) }.onSuccess { error("expected completion commit failure") }
    assertEquals("processing", f.store.find(requestId)?.status)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), f.store.read(requestId))
  }

  @Test fun unauthenticatedFailureKeepsEncryptedAudioForSettingsDeletion() {
    val f = fixture(); f.store.bind("account-a", "watch-node-a")
    val failed = f.store.failPendingForCurrentBinding("authentication_required")
    assertEquals(listOf(requestId), failed.map { it.requestId })
    assertEquals("failed", f.store.find(requestId)?.status)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), f.store.read(requestId))
  }

  @Test fun handoffFailurePreservesAnAlreadyActiveOwner() {
    val f = fixture(); f.store.bind("account-a", "watch-node-a")
    assertTrue(f.store.claimPending(requestId, "account-a"))
    val second = record().copy(requestId = "018f47e2-9abc-7def-8abc-123456789013")
    assertTrue(f.store.insert(second, byteArrayOf(5, 6)))
    val closed = f.store.failPendingForCurrentBinding("handoff_failed", includeProcessing = false)
    assertEquals(listOf(second.requestId), closed.map { it.requestId })
    assertEquals("processing", f.store.find(requestId)?.status)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), f.store.read(requestId))
  }

  @Test fun completionCleanupFailureKeepsCompletedStateAndRetriesCryptoErasure() {
    val f = fixture(); assertTrue(f.store.claimPending(requestId, "account-a")); f.keys.failDelete = true
    runCatching { f.store.markCompleted(requestId) }.onSuccess { error("expected key cleanup failure") }
    assertEquals("completed", f.store.find(requestId)?.status)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), f.store.read(requestId))
    f.keys.failDelete = false
    f.store.cleanupTerminalAudio(requestId)
    assertNull(f.disk.read("audio:$requestId"))
    assertFalse(runCatching { f.store.read(requestId) }.isSuccess)
  }

  @Test fun deleteMetadataFailurePreservesAudioAndItsDecryptionKey() {
    val f = fixture(); f.disk.failNextWrite = "metadata"
    runCatching { f.store.remove(requestId) }.onSuccess { error("expected tombstone failure") }
    assertEquals("pending", f.store.find(requestId)?.status)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), f.store.read(requestId))
  }

  @Test fun keyDeletionFailureRestoresVisibleFailedStateAndCanBeRetried() {
    val f = fixture(); f.keys.failDelete = true
    runCatching { f.store.remove(requestId) }.onSuccess { error("expected key deletion failure") }
    assertEquals("failed", f.store.find(requestId)?.status)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), f.store.read(requestId))
    f.keys.failDelete = false
    assertTrue(f.store.remove(requestId))
    assertEquals("deleted", f.store.find(requestId)?.status)
    assertNull(f.disk.read("audio:$requestId"))
  }

  @Test fun fileCleanupFailureAfterCryptoErasureKeepsDeletionTombstone() {
    val f = fixture(); f.disk.failDelete = true
    runCatching { f.store.remove(requestId) }.onSuccess { error("expected file cleanup failure") }
    assertEquals("deleted", f.store.find(requestId)?.status)
    assertFalse(runCatching { f.store.read(requestId) }.isSuccess)
    assertFalse(f.store.insert(record(), byteArrayOf(8)))
    f.disk.failDelete = false
    f.store.cleanupTerminalAudio(requestId)
    assertNull(f.disk.read("audio:$requestId"))
  }

  @Test fun encryptedMetadataBackupCanRecoverAndPlaybackRequiresOriginatingAccount() {
    val f = fixture(); f.disk.moveToBackup("metadata")
    assertEquals("pending", f.store.find(requestId)?.status)
    assertTrue(WatchQueuePolicy.canPlay("failed", "account-a", "account-a"))
    assertFalse(WatchQueuePolicy.canPlay("failed", "account-a", "account-b"))
    assertFalse(WatchQueuePolicy.canPlay("completed", "account-a", "account-a"))
  }

  private class Fixture {
    val disk = MemoryDisk()
    val keys = MemoryKeys()
    val store = WatchAudioStore(disk, keys)
  }
  private class MemoryDisk : WatchAudioDisk {
    private val base = ConcurrentHashMap<String, ByteArray>()
    private val backup = ConcurrentHashMap<String, ByteArray>()
    var failNextWrite: String? = null
    var failDelete = false
    override fun read(name: String): ByteArray? = (base[name] ?: backup[name])?.copyOf()
    override fun writeAtomic(name: String, bytes: ByteArray) {
      if (failNextWrite == name) { failNextWrite = null; throw IllegalStateException("injected write failure") }
      base[name] = bytes.copyOf(); backup.remove(name)
    }
    override fun delete(name: String) { if (failDelete) throw IllegalStateException("injected disk delete failure"); base.remove(name); backup.remove(name) }
    fun moveToBackup(name: String) { backup[name] = base.remove(name)!! }
  }
  private class MemoryKeys : WatchAudioKeyProvider {
    private val entries = ConcurrentHashMap<String, SecretKey>()
    var failDelete = false
    override fun get(alias: String): SecretKey = entries.computeIfAbsent(alias) { SecretKeySpec(ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }, "AES") }
    override fun delete(alias: String) { if (failDelete) throw IllegalStateException("injected key delete failure"); entries.remove(alias) }
  }
}

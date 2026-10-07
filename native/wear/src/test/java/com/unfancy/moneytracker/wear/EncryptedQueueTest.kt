package com.unfancy.moneytracker.wear

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import javax.crypto.spec.SecretKeySpec

class EncryptedQueueTest {
    private class MemoryQueueFile(var bytes: ByteArray? = null) : DurableQueueFile {
        var failNextWrite = false
        override fun read(): ByteArray? = bytes?.copyOf()
        override fun write(bytes: ByteArray): Boolean {
            if (failNextWrite) { failNextWrite = false; return false }
            this.bytes = bytes.copyOf()
            return true
        }
    }

    private val testKey = SecretKeySpec(ByteArray(32) { (it + 1).toByte() }, "AES")
    private fun queue(file: MemoryQueueFile) = EncryptedQueue(storage = file, testKey = testKey)
    private fun recording(index: Int, audio: ByteArray = byteArrayOf(index.toByte(), 11, 42)) = Recording(
        "019b0f3a-2230-7abc-8def-${index.toString().padStart(12, '0')}",
        "account-a", "phone-a", "2026-10-06T12:00:00Z", 800, "audio/mp4", audio,
    )

    @Test fun tenEncryptedItemsSurviveReopenAndEleventhIsRejected() {
        val file = MemoryQueueFile()
        val firstProcess = queue(file)
        repeat(10) { assertTrue(firstProcess.add(recording(it))) }

        val reopened = queue(file)
        assertEquals(10, reopened.list().size)
        assertTrue(reopened.available())
        assertFalse(reopened.add(recording(10)))
        assertEquals(10, reopened.list().size)
        assertFalse(String(file.bytes!!).contains("account-a"))
        assertFalse(String(file.bytes!!).contains("audio/mp4"))
    }

    @Test fun failedDurableWriteRetainsPreviouslyCommittedQueue() {
        val file = MemoryQueueFile()
        val queue = queue(file)
        assertTrue(queue.add(recording(1)))
        val committed = file.bytes!!.copyOf()
        file.failNextWrite = true

        assertFalse(queue.add(recording(2)))
        assertArrayEquals(committed, file.bytes)
        assertEquals(listOf(recording(1).requestId), queue.list().map { it.requestId })
    }

    @Test fun duplicateRequestIdCannotReplaceQueuedAudio() {
        val file = MemoryQueueFile()
        val queue = queue(file)
        assertTrue(queue.add(recording(3, byteArrayOf(1, 2, 3))))
        assertFalse(queue.add(recording(3, byteArrayOf(9, 9, 9))))
        assertArrayEquals(byteArrayOf(1, 2, 3), queue.list().single().audio)
    }

    @Test fun corruptedQueueFailsClosedAndPreservesStoredBytes() {
        val corrupt = byteArrayOf(1, 2, 3, 4, 5)
        val file = MemoryQueueFile(corrupt.copyOf())
        val queue = queue(file)

        assertTrue(queue.list().isEmpty())
        assertFalse(queue.available())
        assertFalse(queue.add(recording(4)))
        assertFalse(queue.remove(recording(4).requestId))
        assertArrayEquals(corrupt, file.bytes)
    }
}

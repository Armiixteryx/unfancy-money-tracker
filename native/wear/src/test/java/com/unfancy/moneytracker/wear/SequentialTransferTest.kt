package com.unfancy.moneytracker.wear

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class SequentialTransferTest {
    private fun record(id: String) = Recording(id, "synthetic-account", "synthetic-node", "2026-10-06T12:00:00Z", 1000, "audio/mp4", byteArrayOf(1))
    @Test fun fastReceiptContinuesAfterConcurrentDrainWasBlocked() = runBlocking {
        val pending = mutableListOf(record("first"), record("second"))
        val sender = SequentialTransfer()
        val sent = mutableListOf<String>()
        sender.drain({ pending.firstOrNull() }) { item ->
            sent.add(item.requestId)
            pending.removeAt(0)
            // The receipt handler attempts to send the next while the original put still owns the lock.
            sender.drain({ pending.firstOrNull() }) { error("concurrent put") }
        }
        assertEquals(listOf("first", "second"), sent)
        assertEquals(0, pending.size)
    }
    @Test fun waitsForTerminalReceiptAndRetainsHeadAfterSendFailure() = runBlocking {
        val pending = mutableListOf(record("first"), record("second"))
        val sender = SequentialTransfer()
        val sent = mutableListOf<String>()
        sender.drain({ pending.firstOrNull() }) { sent.add(it.requestId) }
        assertEquals(listOf("first"), sent)
        assertEquals(2, pending.size)
        runCatching { sender.drain({ pending.firstOrNull() }) { error("synthetic send failure") } }
        assertEquals(2, pending.size)
        pending.removeAt(0)
        sender.drain({ pending.firstOrNull() }) { sent.add(it.requestId) }
        assertEquals(listOf("first", "second"), sent)
    }
    @Test fun receiptAfterHeadCheckRequestsAnotherDrainBeforeUnlock() = runBlocking {
        val pending = mutableListOf(record("first"), record("second"))
        val sender = SequentialTransfer()
        val sent = mutableListOf<String>()
        var reads = 0
        sender.drain({
            val head = pending.firstOrNull()
            if (++reads == 2) {
                pending.removeAt(0)
                runBlocking { sender.drain({ pending.firstOrNull() }) { error("concurrent put") } }
            }
            head
        }) { sent.add(it.requestId) }
        assertEquals(listOf("first", "second"), sent)
        assertEquals(1, pending.size)
    }

}

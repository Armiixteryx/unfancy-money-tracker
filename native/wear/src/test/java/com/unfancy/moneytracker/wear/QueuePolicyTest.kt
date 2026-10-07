package com.unfancy.moneytracker.wear

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QueuePolicyTest {
    private fun recording(account: String = "account-a", node: String = "phone-a") =
        Recording("019b0f3a-2230-7abc-8def-0123456789ab", account, node, "2026-10-06T12:00:00Z", 800, "audio/mp4", byteArrayOf(1))

    @Test fun queueStopsAtTen() {
        assertTrue(QueuePolicy.canEnqueue(9))
        assertFalse(QueuePolicy.canEnqueue(10))
        assertFalse(QueuePolicy.canEnqueue(11))
    }

    @Test fun onlyFinalPhoneOutcomesAreTerminal() {
        assertFalse(QueuePolicy.terminalAck("accepted"))
        assertTrue(QueuePolicy.terminalAck("completed"))
        assertTrue(QueuePolicy.terminalAck("failed"))
        assertTrue(QueuePolicy.terminalAck("deleted"))
    }

    @Test fun durationMatchesVoiceContract() {
        assertFalse(QueuePolicy.validDuration(249))
        assertTrue(QueuePolicy.validDuration(250))
        assertTrue(QueuePolicy.validDuration(15_000))
        assertFalse(QueuePolicy.validDuration(15_001))
    }

    @Test fun logoutDoesNotPreventOriginalPhoneTerminalAck() {
        val saved = recording()
        assertTrue(QueuePolicy.ackMatches(saved, saved.requestId, "account-a", "phone-a", "failed"))
        assertFalse(QueuePolicy.ackMatches(saved, saved.requestId, "account-b", "phone-a", "failed"))
        assertFalse(QueuePolicy.ackMatches(saved, saved.requestId, "account-a", "phone-b", "failed"))
    }

    @Test fun anotherLoginCannotRebindPendingAudio() {
        val pending = listOf(recording())
        assertTrue(QueuePolicy.canRebind(pending, "account-a", "phone-a"))
        assertFalse(QueuePolicy.canRebind(pending, "account-b", "phone-a"))
        assertFalse(QueuePolicy.canRebind(pending, "account-a", "phone-b"))
    }
}

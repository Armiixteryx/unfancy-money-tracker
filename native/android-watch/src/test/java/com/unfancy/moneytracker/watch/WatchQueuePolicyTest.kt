package com.unfancy.moneytracker.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchQueuePolicyTest {
  @Test fun claimsAreAccountScopedAndPendingOnly() {
    assertTrue(WatchQueuePolicy.canClaim("pending", "sub-a", "sub-a"))
    assertFalse(WatchQueuePolicy.canClaim("pending", "sub-a", "sub-b"))
    assertFalse(WatchQueuePolicy.canClaim("pending", "", "sub-a"))
    assertFalse(WatchQueuePolicy.canClaim("processing", "sub-a", "sub-a"))
    assertFalse(WatchQueuePolicy.canClaim("failed", "sub-a", "sub-a"))
  }

  @Test fun interruptionsBecomeTerminalAndAreNotAutomaticallyClaimedAgain() {
    assertEquals("failed", WatchQueuePolicy.interruptedStatus("processing"))
    assertEquals(null, WatchQueuePolicy.interruptedStatus("pending"))
    assertTrue(WatchQueuePolicy.isTerminal("failed"))
    assertFalse(WatchQueuePolicy.canClaim("failed", "sub-a", "sub-a"))
  }

  @Test fun onlyPersistedOrReconciledProcessingCanComplete() {
    assertTrue(WatchQueuePolicy.canMarkCompleted("processing"))
    assertTrue(WatchQueuePolicy.canMarkCompleted("failed"))
    assertFalse(WatchQueuePolicy.canMarkCompleted("pending"))
    assertFalse(WatchQueuePolicy.canMarkCompleted("deleted"))
  }

  @Test fun deletionTombstonesRemainDuplicateSuppressingTerminalRecords() {
    assertTrue(WatchQueuePolicy.isTerminal("deleted"))
    assertFalse(WatchQueuePolicy.canClaim("deleted", "sub-a", "sub-a"))
  }
}

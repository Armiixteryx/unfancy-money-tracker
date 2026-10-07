package com.unfancy.moneytracker.watch

/** Shared queue transition rules used by the durable Android store and JVM tests. */
internal object WatchQueuePolicy {
  fun canClaim(status: String, recordAccountId: String, activeAccountId: String): Boolean =
    status == "pending" && recordAccountId.isNotBlank() && recordAccountId == activeAccountId

  fun isTerminal(status: String): Boolean = status == "completed" || status == "failed" || status == "deleted"

  fun interruptedStatus(status: String): String? = if (status == "processing") "failed" else null

  fun canMarkCompleted(status: String): Boolean = status == "processing" || status == "failed" || status == "completed"

  fun canMarkFailed(status: String): Boolean = status == "pending" || status == "processing" || status == "failed"

  fun canPlay(status: String, recordAccountId: String, activeAccountId: String?): Boolean =
    (status == "failed" || status == "pending" || status == "processing") && !activeAccountId.isNullOrBlank() && recordAccountId == activeAccountId
}

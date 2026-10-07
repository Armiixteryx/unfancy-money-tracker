package com.unfancy.moneytracker.wear

internal object QueuePolicy {
    const val MAX_ITEMS = 10
    const val MIN_RECORDING_MS = 250L
    const val MAX_RECORDING_MS = 15_000L

    fun canEnqueue(itemCount: Int): Boolean = itemCount in 0 until MAX_ITEMS

    fun validDuration(durationMs: Long): Boolean = durationMs in MIN_RECORDING_MS..MAX_RECORDING_MS

    fun belongsToPhone(recording: Recording, accountId: String, nodeId: String): Boolean =
        recording.accountId == accountId && recording.phoneNodeId == nodeId

    fun canRebind(queue: List<Recording>, accountId: String, nodeId: String): Boolean =
        queue.all { belongsToPhone(it, accountId, nodeId) }

    fun ackMatches(recording: Recording?, requestId: String, accountId: String, nodeId: String, status: String): Boolean =
        recording != null && recording.requestId == requestId && belongsToPhone(recording, accountId, nodeId) && terminalAck(status)

    fun terminalAck(status: String): Boolean = status == "completed" || status == "failed" || status == "deleted"
}

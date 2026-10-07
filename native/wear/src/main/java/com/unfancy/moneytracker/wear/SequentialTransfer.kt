package com.unfancy.moneytracker.wear

/** Preserve receipt-triggered drain requests even while a put still owns the sender. */
internal class SequentialTransfer {
    private val lock = Any()
    private var running = false
    private var rerun = false

    suspend fun drain(first: () -> Recording?, send: suspend (Recording) -> Unit) {
        val alreadyRunning = synchronized(lock) {
            if (running) { rerun = true; true } else { running = true; false }
        }
        if (alreadyRunning) return
        var ownsSender = true
        try {
            while (true) {
                synchronized(lock) { rerun = false }
                while (true) {
                    val recording = first() ?: break
                    send(recording)
                    if (first()?.requestId == recording.requestId) break
                }
                val again = synchronized(lock) {
                    if (rerun) true else { running = false; ownsSender = false; false }
                }
                if (!again) return
            }
        } finally {
            if (ownsSender) synchronized(lock) { running = false }
        }
    }
}

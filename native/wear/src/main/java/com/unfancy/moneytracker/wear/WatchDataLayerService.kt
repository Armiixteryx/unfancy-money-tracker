package com.unfancy.moneytracker.wear

import android.content.Intent
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class WatchDataLayerService : WearableListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(event: MessageEvent) {
        val transport = WatchTransport(this)
        when (event.path) {
            WatchTransport.SETUP_PATH -> {
                transport.acceptSetup(event.data, event.sourceNodeId)
                sendBroadcast(Intent(WatchTransport.STATE_CHANGED_ACTION).setPackage(packageName))
                scope.launch { transport.transferPending() }
            }
            WatchTransport.ACK_PATH -> {
                val payload = event.data.copyOf()
                val sourceNodeId = event.sourceNodeId
                scope.launch {
                    if (transport.acceptAck(payload, sourceNodeId)) {
                        sendBroadcast(Intent(WatchTransport.STATE_CHANGED_ACTION).setPackage(packageName))
                        transport.transferPending()
                    }
                }
            }
            else -> super.onMessageReceived(event)
        }
    }

    override fun onPeerConnected(peer: com.google.android.gms.wearable.Node) {
        super.onPeerConnected(peer)
        scope.launch {
            val transport = WatchTransport(this@WatchDataLayerService)
            transport.requestSetup()
            transport.transferPending()
        }
    }
}

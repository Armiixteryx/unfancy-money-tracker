package com.unfancy.moneytracker.wear

import org.junit.Assert.assertEquals
import org.junit.Test

class WatchScreenModeTest {
    @Test fun unconfiguredOrSignedOutPhoneShowsSetupOnlyMode() {
        assertEquals(WatchScreenMode.Setup, watchScreenMode(phoneReady = false))
    }

    @Test fun signedInPhoneBindingEnablesFullWatchMode() {
        assertEquals(WatchScreenMode.Ready, watchScreenMode(phoneReady = true))
    }
}

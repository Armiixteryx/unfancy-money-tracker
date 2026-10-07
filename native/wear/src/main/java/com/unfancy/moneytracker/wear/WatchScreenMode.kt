package com.unfancy.moneytracker.wear

internal enum class WatchScreenMode { Setup, Ready }

internal fun watchScreenMode(phoneReady: Boolean): WatchScreenMode =
    if (phoneReady) WatchScreenMode.Ready else WatchScreenMode.Setup

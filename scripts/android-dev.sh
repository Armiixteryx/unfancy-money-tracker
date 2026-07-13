#!/usr/bin/env bash
set -euo pipefail

if ! command -v adb >/dev/null 2>&1; then
  echo "ADB is required. Install Android platform-tools and ensure adb is on PATH." >&2
  exit 1
fi

# Expo may need to launch the emulator first, so wait for a device in parallel.
# Port reversal lets Android share the localhost SAM API configuration used by
# web and the iOS Simulator.
(
  adb wait-for-device
  adb reverse tcp:3001 tcp:3001
  echo "Android port 3001 is forwarded to the host SAM API."
) &

exec expo run:android "$@"

#!/usr/bin/env bash
set -euo pipefail

if ! command -v adb >/dev/null 2>&1; then
  echo "ADB is required for start:all. Install Android platform-tools and ensure adb is on PATH." >&2
  exit 1
fi

# The emulator may be launched later with Expo's `a` shortcut. Wait in the
# background and configure its access to the host SAM API when it becomes ready.
(
  adb wait-for-device
  adb reverse tcp:3001 tcp:3001
  echo "Android port 3001 is forwarded to the host SAM API."
) &

exec expo start --dev-client

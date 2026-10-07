#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Source is canonical under native/. Restore it before compiling generated projects.
pnpm exec expo prebuild --platform android --no-install
cd android
./gradlew :wear:assembleDebug :wear:testDebugUnitTest :app:testDebugUnitTest "$@"

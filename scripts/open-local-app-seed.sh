#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

preset=""
target=""
dry_run=false

for argument in "$@"; do
  case "$argument" in
    --preset=dashboard|--preset=edge-cases) preset="${argument#--preset=}" ;;
    --target=ios|--target=android|--target=web) target="${argument#--target=}" ;;
    --dry-run) dry_run=true ;;
    *)
      echo "Usage: pnpm run local:seed-app -- --preset=<dashboard|edge-cases> --target=<ios|android|web> [--dry-run]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$preset" || -z "$target" ]]; then
  echo "Both --preset and --target are required." >&2
  exit 1
fi

env_file=".env.local"
[[ -f "$env_file" ]] || env_file=".env.example"
environment="$(sed -n 's/^EXPO_PUBLIC_ENV=//p' "$env_file" | tail -n 1)"
if [[ "$environment" != "local" ]]; then
  echo "Refusing to open mock-data seeding because EXPO_PUBLIC_ENV is not local in $env_file." >&2
  exit 1
fi

route="developer-seed?preset=$preset&resetLocalPreview=1"
case "$target" in
  ios)
    url="unfancy-money-tracker:///$route"
    launcher=(xcrun simctl openurl booted "$url")
    ;;
  android)
    url="unfancy-money-tracker:///$route"
    launcher=(adb shell am start -W -a android.intent.action.VIEW -d "$url")
    ;;
  web)
    base_url="${EXPO_DEV_SERVER_URL:-http://127.0.0.1:8081}"
    url="${base_url%/}/$route"
    launcher=(open "$url")
    ;;
esac

echo "Opening $preset mock-data confirmation on $target: $url"
if [[ "$dry_run" == true ]]; then
  exit 0
fi

command -v "${launcher[0]}" >/dev/null 2>&1 || {
  echo "${launcher[0]} is required to open the $target target." >&2
  exit 1
}
"${launcher[@]}"

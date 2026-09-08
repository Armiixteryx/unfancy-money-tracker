#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: pnpm run verify:web:deployment -- <base-url>" >&2
  exit 2
fi

BASE_URL="${1%/}"
case "$BASE_URL" in
  http://*|https://*)
    ;;
  *)
    echo "Base URL must start with http:// or https://." >&2
    exit 2
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify the web deployment." >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/unfancy-web-verify.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

fetch() {
  local path="$1"
  local name="$2"
  local output

  if ! output="$(curl --silent --show-error --location --connect-timeout 10 --max-time 30 \
    --dump-header "$TEMP_DIR/$name.headers" \
    --output "$TEMP_DIR/$name.body" \
    --write-out '%{http_code}\t%{content_type}' \
    "$BASE_URL$path")"; then
    echo "Request failed: $BASE_URL$path" >&2
    return 1
  fi

  printf '%s\n' "$output"
}

require_html() {
  local path="$1"
  local name="$2"
  local response
  local status
  local content_type

  response="$(fetch "$path" "$name")"
  status="${response%%$'\t'*}"
  content_type="${response#*$'\t'}"

  if [[ "$status" != "200" ]]; then
    echo "Expected $path to return HTTP 200, got $status." >&2
    return 1
  fi
  case "$content_type" in
    text/html*)
      ;;
    *)
      echo "Expected $path to return text/html, got ${content_type:-unknown}." >&2
      return 1
      ;;
  esac
  if ! grep -Eiq '<!doctype[[:space:]]+html|<html([[:space:]>]|$)' "$TEMP_DIR/$name.body"; then
    echo "Expected $path to contain an HTML document." >&2
    return 1
  fi

  echo "PASS $path (HTTP $status, $content_type)"
}

require_html "/" root
require_html "/transactions" transactions
require_html "/budgets" budgets
require_html "/reports" reports
require_html "/settings" settings

BUNDLE_PATH="$(grep -Eo '/_expo/static/js/[^"[:space:]]*/entry-[[:alnum:]_-]+\.js' "$TEMP_DIR/root.body" | head -n 1 || true)"
if [[ -z "$BUNDLE_PATH" ]]; then
  echo "Could not find a hashed Expo entry bundle in the root document." >&2
  exit 1
fi

BUNDLE_RESPONSE="$(fetch "$BUNDLE_PATH" bundle)"
BUNDLE_STATUS="${BUNDLE_RESPONSE%%$'\t'*}"
BUNDLE_CONTENT_TYPE="${BUNDLE_RESPONSE#*$'\t'}"
if [[ "$BUNDLE_STATUS" != "200" ]]; then
  echo "Expected $BUNDLE_PATH to return HTTP 200, got $BUNDLE_STATUS." >&2
  exit 1
fi
case "$BUNDLE_CONTENT_TYPE" in
  application/javascript*|text/javascript*|application/x-javascript*)
    ;;
  *)
    echo "Expected $BUNDLE_PATH to return JavaScript, got ${BUNDLE_CONTENT_TYPE:-unknown}." >&2
    exit 1
    ;;
esac
if grep -Eiq '<!doctype[[:space:]]+html|<html([[:space:]>]|$)' "$TEMP_DIR/bundle.body"; then
  echo "The Expo entry bundle returned an HTML document instead of JavaScript." >&2
  exit 1
fi
echo "PASS $BUNDLE_PATH (HTTP $BUNDLE_STATUS, $BUNDLE_CONTENT_TYPE)"

FAVICON_RESPONSE="$(fetch "/favicon.ico" favicon)"
FAVICON_STATUS="${FAVICON_RESPONSE%%$'\t'*}"
if grep -Fq "$BUNDLE_PATH" "$TEMP_DIR/favicon.body"; then
  echo "/favicon.ico was rewritten to the app shell (HTTP $FAVICON_STATUS)." >&2
  exit 1
fi
echo "PASS /favicon.ico was not rewritten to the app shell (HTTP $FAVICON_STATUS)"

#!/usr/bin/env bash
set -euo pipefail

stage="${1:-}"
if [[ "$stage" != "dev" && "$stage" != "prod" ]]; then
  echo "Usage: scripts/deploy-infrastructure.sh <dev|prod>" >&2
  exit 1
fi
if [[ "$stage" == "prod" && "${ALLOW_PROD_DEPLOY:-}" != "1" ]]; then
  echo "Production deployment is deferred. Set ALLOW_PROD_DEPLOY=1 only after an approved production review." >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

pnpm exec cdk deploy "UnfancyMoneyTracker-$stage" \
  --context "stage=$stage" \
  --outputs-file ".cdk-outputs.$stage.json" \
  --require-approval broadening

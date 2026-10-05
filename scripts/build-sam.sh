#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export UNFANCY_WORKSPACE_ROOT="$PWD"
# Keep native artifacts and dependency installs out of SAM's temporary source copy.
exec sam build --template-file sam/template.yaml --build-dir .aws-sam/build "$@"

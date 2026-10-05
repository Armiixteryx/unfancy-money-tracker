#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${LOCAL_ENV_FILE:-.env.local}"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE=".env.example"
  echo "Using safe defaults from .env.example. Copy it to .env.local to customize local ports."
fi
set -a
source "$ENV_FILE"
set +a

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required. Install Docker Desktop, then rerun this command." >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed but unavailable. Start Docker Desktop, then rerun this command." >&2
    exit 1
  fi
}

require_sam() {
  if ! command -v sam >/dev/null 2>&1; then
    echo "AWS SAM CLI is required for SAM commands. Install it from https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html" >&2
    exit 1
  fi
}

case "${1:-help}" in
  start)
    require_docker
    compose up -d dynamodb
    pnpm exec tsx scripts/local-dynamodb.ts init
    compose ps
    ;;
  stop)
    require_docker
    compose stop dynamodb localstack
    ;;
  reset)
    require_docker
    if [[ "${APP_ENV:-local}" != "local" && -n "${CI:-}" ]]; then
      echo "Refusing reset outside the local environment." >&2
      exit 1
    fi
    compose down --volumes --remove-orphans
    rm -rf .aws-sam .localstack
    echo "Local containers, volumes, and generated SAM/LocalStack artifacts were removed."
    ;;
  init)
    require_docker
    compose up -d dynamodb
    pnpm exec tsx scripts/local-dynamodb.ts init
    ;;
  seed)
    require_docker
    "$0" init
    pnpm exec tsx scripts/local-dynamodb.ts seed
    ;;
  sam-api)
    require_docker
    require_sam
    if [[ ! -f sam/template.yaml ]]; then
      echo "sam/template.yaml is not available yet. Complete the AWS adapter milestone first." >&2
      exit 1
    fi
    sam validate --template sam/template.yaml --lint
    sam build --template-file sam/template.yaml --build-dir .aws-sam/build --cached
    pnpm exec tsx scripts/voice-environment.ts
    sam local start-api --template .aws-sam/build/template.yaml --env-vars sam/env.voice.local.json --skip-pull-image --host 127.0.0.1 --port "${SAM_PORT:-3001}"
    ;;
  sam-lambda)
    require_docker
    require_sam
    if [[ ! -f sam/template.yaml ]]; then
      echo "sam/template.yaml is not available yet. Complete the AWS adapter milestone first." >&2
      exit 1
    fi
    sam validate --template sam/template.yaml --lint
    sam build --template-file sam/template.yaml --build-dir .aws-sam/build --cached
    sam local start-lambda --template .aws-sam/build/template.yaml --skip-pull-image --host 127.0.0.1 --port "${SAM_LAMBDA_PORT:-3002}"
    ;;
  localstack-start)
    require_docker
    compose --profile localstack up -d localstack
    compose ps localstack
    ;;
  localstack-stop)
    require_docker
    compose --profile localstack stop localstack
    ;;
  status)
    require_docker
    compose ps
    ;;
  health)
    require_docker
    pnpm exec tsx scripts/local-dynamodb.ts health
    ;;
  verify)
    require_docker
    require_sam
    node --version
    docker --version
    docker compose version
    sam --version
    compose config --quiet
    echo "Local prerequisites and Compose configuration are ready."
    ;;
  test)
    pnpm test -- --run
    ;;
  typecheck)
    pnpm run typecheck
    ;;
  lint)
    pnpm run lint
    ;;
  contract)
    require_sam
    pnpm run test:contract
    ;;
  integration)
    require_docker
    "$0" init
    pnpm run test:integration
    ;;
  help|*)
    cat <<'HELP'
Unfancy Money Tracker local environment

Usage: scripts/local-env.sh <command>

  start              Start DynamoDB Local and initialize the sync and rate-cache tables
  stop               Stop local services without deleting data
  reset              Delete local containers, volumes, and generated artifacts
  init               Create the local DynamoDB sync and rate-cache tables if needed
  seed               Apply the synthetic backend fixture
  sam-api            Start the SAM API on port 3001
  sam-lambda         Start the SAM Lambda endpoint on port 3002
  localstack-start   Start optional LocalStack services on port 4566
  localstack-stop    Stop optional LocalStack services
  status             Show local service status
  health             Check DynamoDB Local and the sync table
  verify             Check Docker, SAM CLI, and Compose configuration
  test               Run the deterministic unit test suite
  integration        Run local adapter and sync integration tests
  contract           Validate SAM and synthesize CDK without deploying
  typecheck          Run the strict TypeScript check
  lint               Run ESLint

The default ports are DynamoDB Local 8000, SAM API 3001, SAM Lambda 3002,
and optional LocalStack 4566.
Set LOCAL_ENV_FILE=.env.local to use a local override file.
HELP
    ;;
esac

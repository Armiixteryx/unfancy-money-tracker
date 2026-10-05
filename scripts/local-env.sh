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
    compose up -d --wait postgres
    compose run --rm flyway validate migrate
    compose ps
    ;;
  stop)
    require_docker
    compose stop postgres
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
    compose up -d --wait postgres
    compose run --rm flyway validate migrate
    ;;
  seed)
    require_docker
    "$0" init
    echo "Use local:seed-app for explicit synthetic app fixtures."
    ;;
  sam-api)
    require_docker
    require_sam
    if [[ ! -f sam/template.yaml ]]; then
      echo "sam/template.yaml is not available yet. Complete the AWS adapter milestone first." >&2
      exit 1
    fi
    sam validate --template sam/template.yaml --lint
    bash scripts/build-sam.sh
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
    bash scripts/build-sam.sh
    sam local start-lambda --template .aws-sam/build/template.yaml --skip-pull-image --host 127.0.0.1 --port "${SAM_LAMBDA_PORT:-3002}"
    ;;
  status)
    require_docker
    compose ps
    ;;
  health)
    require_docker
    compose exec -T postgres pg_isready -U unfancy_migrations -d unfancy
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

  start              Start PostgreSQL 18.6 and run Flyway
  stop               Stop local services without deleting data
  reset              Delete local containers, volumes, and generated artifacts
  init               Validate and apply versioned SQL migrations
  seed               Apply the synthetic backend fixture
  sam-api            Start the SAM API on port 3001
  sam-lambda         Start the SAM Lambda endpoint on port 3002
  status             Show local service status
  health             Check PostgreSQL readiness
  verify             Check Docker, SAM CLI, and Compose configuration
  test               Run the deterministic unit test suite
  integration        Run local adapter and sync integration tests
  contract           Validate SAM and synthesize CDK without deploying
  typecheck          Run the strict TypeScript check
  lint               Run ESLint

The default ports are PostgreSQL 5432, SAM API 3001, SAM Lambda 3002.
Set LOCAL_ENV_FILE=.env.local to use a local override file.
HELP
    ;;
esac

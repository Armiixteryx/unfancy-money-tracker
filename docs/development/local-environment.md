# Local development environment

The default development loop is local-only and does not require AWS credentials:

- PostgreSQL 16 runs in Docker on port `5432`.
- MailHog captures local confirmation and password-reset email on SMTP `1025` and UI `http://127.0.0.1:8025`.
- SAM CLI runs API Gateway-compatible Lambda routes on `http://127.0.0.1:3001` once `sam/template.yaml` exists.
- LocalStack is optional and runs only when an AWS SDK contract test needs it, on port `4566`.

Copy `.env.example` to `.env.local` only when a local override is needed. The committed defaults are synthetic and non-production. Never place AWS credentials, production database credentials, PostHog project keys, real email destinations, or real financial data in local configuration or fixtures.

## Commands

```sh
scripts/local-env.sh verify
scripts/local-env.sh start
scripts/local-env.sh migrate
scripts/local-env.sh seed
scripts/local-env.sh status
```

Use `scripts/local-env.sh sam-api` for the local API loop, `scripts/local-env.sh sam-lambda` for direct Lambda invocation, and `scripts/local-env.sh localstack-start` only for optional AWS SDK wiring experiments.

`reset` is intentionally destructive but scoped to Docker resources named by this repository and generated `.aws-sam`/`.localstack` directories:

```sh
scripts/local-env.sh reset
```

The client starts with a new empty anonymous dataset. The PostgreSQL seed is for backend contract tests only; it is never demo data in the product UI.


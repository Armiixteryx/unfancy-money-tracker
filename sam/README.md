# SAM local API

The SAM template contains local sync and exchange-rate proxy boundaries for automated integration and contract testing. Local SAM does not provision resources; `local:init` creates the sync and rate-cache tables in DynamoDB Local. AWS resources are deployed through CDK.

From the repository root:

```sh
scripts/local-env.sh start
scripts/local-env.sh init
scripts/local-env.sh sam-api
```

Every local sync request must provide an explicit synthetic `x-local-subject` in `APP_ENV=local`. Deployed handlers require the authenticated Cognito JWT `sub` claim and never accept that development header.

The rates route uses Frankfurter blended rates and the dedicated `unfancy-local-rates` DynamoDB Local table. Run `pnpm run local:init` before starting SAM; rebuild after changes. `sam/env.local.json` supplies the rates table, endpoint, and local credentials. Latest/requested-date records expire in application code after 24 hours and remain stored for stale fallback.

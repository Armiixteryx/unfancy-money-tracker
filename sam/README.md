# SAM local API

The SAM template contains local sync and exchange-rate proxy boundaries for automated integration and contract testing. It does not provide interactive authentication or create AWS resources.

From the repository root:

```sh
scripts/local-env.sh start
scripts/local-env.sh init
scripts/local-env.sh sam-api
```

Every local sync request must provide an explicit synthetic `x-local-subject` in `APP_ENV=local`. Deployed handlers require the authenticated Cognito JWT `sub` claim and never accept that development header.

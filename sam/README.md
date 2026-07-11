# SAM local API

The SAM template contains only the local sync boundary. It does not create or deploy Cognito, API Gateway, Lambda, Aurora, RDS Proxy, SES, or other AWS resources.

From the repository root:

```sh
scripts/local-env.sh start
scripts/local-env.sh migrate
scripts/local-env.sh sam-api
```

The local adapter accepts `x-local-subject` in `APP_ENV=local` only. Deployed handlers require the authenticated Cognito JWT `sub` claim and never accept that development header.


# SAM local API

The SAM template contains local sync and auth-email boundaries. It does not create or deploy Cognito, API Gateway, Lambda, Aurora, RDS Proxy, SES, or other AWS resources.

From the repository root:

```sh
scripts/local-env.sh start
scripts/local-env.sh migrate
scripts/local-env.sh sam-api
```

The local sign-up and password-reset flows POST synthetic six-digit codes to `/auth/email`. The SAM handler delivers them to MailHog over SMTP; inspect them at `http://127.0.0.1:8025`.

The local adapter accepts `x-local-subject` in `APP_ENV=local` only. Deployed handlers require the authenticated Cognito JWT `sub` claim and never accept that development header.

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
export AWS_PAGER=""

for required_command in aws curl pnpm node; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command '$required_command' is not installed or is not on PATH." >&2
    exit 1
  fi
done

if ! aws_account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "AWS authentication is unavailable or expired. Run 'aws login', then retry this deployment." >&2
  exit 1
fi

configured_region="$(aws configure get region 2>/dev/null || true)"
deployment_region="${CDK_DEFAULT_REGION:-${AWS_REGION:-${AWS_DEFAULT_REGION:-${configured_region:-us-east-1}}}}"
if [[ -n "${CDK_DEFAULT_ACCOUNT:-}" && "$CDK_DEFAULT_ACCOUNT" != "$aws_account" ]]; then
  echo "CDK_DEFAULT_ACCOUNT targets '$CDK_DEFAULT_ACCOUNT', but the authenticated AWS account is '$aws_account'." >&2
  exit 1
fi
export CDK_DEFAULT_ACCOUNT="$aws_account"
export CDK_DEFAULT_REGION="$deployment_region"

stack_name="UnfancyMoneyTracker-$stage"
outputs_file=".cdk-outputs.$stage.json"

echo "Deploying $stack_name to AWS account $aws_account in $deployment_region."

if ! toolkit_status="$(
  aws cloudformation describe-stacks \
    --stack-name CDKToolkit \
    --region "$deployment_region" \
    --query "Stacks[0].StackStatus" \
    --output text 2>/dev/null
)"; then
  echo "The AWS account/region is not bootstrapped for CDK. Run 'pnpm exec cdk bootstrap aws://$aws_account/$deployment_region -c stage=$stage' first." >&2
  exit 1
fi
if [[ "$toolkit_status" != "CREATE_COMPLETE" && "$toolkit_status" != "UPDATE_COMPLETE" ]]; then
  echo "The CDKToolkit stack is not ready; its current status is '$toolkit_status'." >&2
  exit 1
fi

if aws cloudformation describe-stacks --stack-name "$stack_name" --region "$deployment_region" >/dev/null 2>&1; then
  legacy_database="$(
    aws cloudformation list-stack-resources \
      --stack-name "$stack_name" \
      --region "$deployment_region" \
      --query "StackResourceSummaries[?ResourceType=='AWS::RDS::DBCluster'].PhysicalResourceId" \
      --output text
  )"
  if [[ -n "$legacy_database" ]]; then
    echo "Refusing to replace the deployed Aurora database automatically. Create an explicit cloud-data migration plan first." >&2
    exit 1
  fi
fi

concurrency_mode="reserved"
cdk_context=(--context "stage=$stage")
if [[ "$stage" == "dev" ]]; then
  concurrency_mode="${DEV_LAMBDA_CONCURRENCY_MODE:-reserved}"
  if [[ "$concurrency_mode" != "shared" && "$concurrency_mode" != "reserved" ]]; then
    echo "DEV_LAMBDA_CONCURRENCY_MODE must be shared or reserved." >&2
    exit 1
  fi
  cdk_context+=(--context "devConcurrencyMode=$concurrency_mode")
fi
unreserved="$(aws lambda get-account-settings --region "$deployment_region" --query 'AccountLimit.UnreservedConcurrentExecutions' --output text)"
owned_reservations=0
if [[ "$concurrency_mode" == "reserved" ]]; then
  for owned_stack in "$stack_name" "UnfancyMoneyTrackerDatabase-$stage"; do
    if owned_functions="$(aws cloudformation list-stack-resources --stack-name "$owned_stack" --region "$deployment_region" --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId" --output text 2>/dev/null)"; then
      for owned_function in $owned_functions; do
        existing_reservation="$(aws lambda get-function-concurrency --function-name "$owned_function" --region "$deployment_region" --query ReservedConcurrentExecutions --output text)"
        if [[ "$existing_reservation" != "None" ]]; then
          owned_reservations=$((owned_reservations + existing_reservation))
        fi
      done
    fi
  done
fi
if [[ "$concurrency_mode" == "reserved" ]] && (( unreserved + owned_reservations < 108 )); then
  echo "Deployment needs room for reserved concurrency 5/2/1 and AWS's 100 unreserved units. Request/await a Lambda quota increase first; no database has been provisioned." >&2
  exit 1
fi
if [[ "$concurrency_mode" == "shared" ]] && (( unreserved < 10 )); then
  echo "Shared development concurrency requires an unreserved pool limit of at least 10. Increase the pool quota or release reservations; no database has been provisioned." >&2
  exit 1
fi
echo "Lambda concurrency mode: $concurrency_mode. Database login-role connection limits remain 5/2."
if [[ "$stage" == "dev" ]]; then
  pnpm exec tsx scripts/voice-environment.ts check --allow-existing-dev-secret
else
  pnpm exec tsx scripts/voice-environment.ts check
fi

echo "Running deployment checks."
./scripts/build-migrations.sh
pnpm run infra:check

echo "Reviewing the full CloudFormation diff."
database_stack="UnfancyMoneyTrackerDatabase-$stage"
# A previous template may contain provider credentials in removed environment
# variables. Keep the full diff private and emit resource actions only.
diff_file="$(mktemp "${TMPDIR:-/tmp}/unfancy-cdk-diff.XXXXXX")"
trap 'rm -f "$diff_file"' EXIT
if ! pnpm exec cdk diff "$database_stack" "$stack_name" "${cdk_context[@]}" >"$diff_file" 2>&1; then
  echo "CloudFormation diff failed; no resources were deployed." >&2
  exit 1
fi
node --input-type=module - "$diff_file" <<'JS'
import { readFileSync } from 'node:fs';
const lines=readFileSync(process.argv[2],'utf8').replace(/\u001b\[[0-9;]*m/g,'').split('\n');
for (const line of lines) if (/^(Stack |\[[+~\-]\] AWS::|Number of stacks with differences:)/.test(line)) console.log(line);
JS

deployment_options=()
if [[ "${CDK_IMPORT_EXISTING_RESOURCES:-}" == "1" ]]; then
  deployment_options+=(--import-existing-resources)
fi

# Database provisioning and Flyway run while the existing API handlers remain available.
pnpm exec cdk deploy "$database_stack" --exclusively "${cdk_context[@]}" --require-approval never --outputs-file ".cdk-database-outputs.$stage.json"
migration_function="$(aws cloudformation describe-stacks --stack-name "$database_stack" --region "$deployment_region" --query 'Stacks[0].Outputs[?OutputKey==`MigrationFunctionName`].OutputValue | [0]' --output text)"
aws lambda invoke --function-name "$migration_function" --region "$deployment_region" --cli-binary-format raw-in-base64-out --payload '{"operation":"migrate"}' ".migration-result.$stage.json" >/dev/null
node --input-type=module - "$stage" <<'JS'
import { readFileSync } from 'node:fs';
const result=JSON.parse(readFileSync(`.migration-result.${process.argv[2]}.json`,'utf8'));
if (result.ok!==true || result.roleConnectionLimitsVerified!==true) {
  const stage=['request','ca_load','database_credentials','flyway_configuration','flyway_validation','flyway_migration','database_connect','role_credentials','role_configuration','role_verification'].includes(result.stage)?result.stage:'unknown';
  const code=['migration_failed','invalid_request'].includes(result.code)?result.code:'unknown';
  console.error(`Migration gate failed (code=${code}, stage=${stage}); existing handlers have not been released.`);
  process.exit(1);
}
JS
# Removing the two DynamoDB tables is the authorized development cloud reset.
pnpm exec cdk deploy "$stack_name" \
  "${cdk_context[@]}" \
  --outputs-file "$outputs_file" \
  --exclusively --require-approval never ${deployment_options[@]+"${deployment_options[@]}"}

if [[ "$stage" == "dev" ]]; then
  pnpm exec tsx scripts/voice-environment.ts dev --reuse-existing
else
  # Populate only the newly created production secret from explicitly supplied
  # and validated local credentials after the service stack exists.
  pnpm exec tsx scripts/voice-environment.ts prod
fi

stack_status="$(
  aws cloudformation describe-stacks \
    --stack-name "$stack_name" \
    --region "$deployment_region" \
    --query "Stacks[0].StackStatus" \
    --output text
)"
if [[ "$stack_status" != "CREATE_COMPLETE" && "$stack_status" != "UPDATE_COMPLETE" ]]; then
  echo "Deployment finished, but $stack_name has unexpected status '$stack_status'." >&2
  exit 1
fi

lambda_functions="$(
  aws cloudformation list-stack-resources \
    --stack-name "$stack_name" \
    --region "$deployment_region" \
    --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId" \
    --output text
)"
if [[ -z "$lambda_functions" || "$lambda_functions" == "None" ]]; then
  echo "Deployment finished, but no Lambda functions were found in $stack_name." >&2
  exit 1
fi

for function_name in $lambda_functions; do
  aws lambda wait function-updated-v2 --function-name "$function_name" --region "$deployment_region"
  function_status="$(
    aws lambda get-function-configuration \
      --function-name "$function_name" \
      --region "$deployment_region" \
      --query "join(':', [State, LastUpdateStatus])" \
      --output text
  )"
  if [[ "$function_status" != "Active:Successful" ]]; then
    echo "Deployment finished, but Lambda '$function_name' reports '$function_status'." >&2
    exit 1
  fi
  echo "Verified Lambda '$function_name' is active and successfully updated."
done

api_url="$(
  aws cloudformation describe-stacks \
    --stack-name "$stack_name" \
    --region "$deployment_region" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" \
    --output text
)"
if [[ -z "$api_url" || "$api_url" == "None" ]]; then
  echo "Deployment finished, but the ApiUrl stack output is missing." >&2
  exit 1
fi
api_url="${api_url%/}"
rates_status="$(curl --silent --show-error --output /dev/null --write-out "%{http_code}" "$api_url/rates")"
if [[ "$rates_status" != "400" ]]; then
  echo "Deployment finished, but the exchange-rate validation smoke test returned HTTP $rates_status instead of 400." >&2
  exit 1
fi

sync_status="$(curl --silent --show-error --output /dev/null --write-out "%{http_code}" --request POST "$api_url/sync/pull")"
if [[ "$sync_status" != "401" && "$sync_status" != "403" ]]; then
  echo "Deployment finished, but the unauthenticated sync smoke test returned HTTP $sync_status instead of 401/403." >&2
  exit 1
fi

api_id="$(aws cloudformation list-stack-resources --stack-name "$stack_name" --region "$deployment_region" --query "StackResourceSummaries[?ResourceType=='AWS::ApiGatewayV2::Api'].PhysicalResourceId | [0]" --output text)"
voice_auth="$(aws apigatewayv2 get-routes --api-id "$api_id" --region "$deployment_region" --query "Items[?RouteKey=='POST /voice/expense'].AuthorizationType | [0]" --output text)"
if [[ "$voice_auth" != "JWT" ]]; then
  echo "Voice route must use the Cognito JWT authorizer." >&2
  exit 1
fi
voice_throttle="$(aws apigatewayv2 get-stage --api-id "$api_id" --stage-name '$default' --region "$deployment_region" --query 'RouteSettings."POST /voice/expense".[ThrottlingRateLimit,ThrottlingBurstLimit]' --output text)"
read -r voice_rate voice_burst <<< "$voice_throttle"
if [[ "$voice_rate" != "0.25" || "$voice_burst" != "2" ]]; then
  echo "Voice route throttling does not match the expected rate and burst." >&2
  exit 1
fi
voice_web_origin="${VOICE_WEB_ORIGIN:-https://main.d127yvlpbgr7e4.amplifyapp.com}"
cors_headers="$(curl --silent --show-error --max-time 35 --output /dev/null --dump-header - --request OPTIONS --header "Origin: $voice_web_origin" --header 'Access-Control-Request-Method: POST' --header 'Access-Control-Request-Headers: authorization,content-type' "$api_url/voice/expense")"
if ! CORS_HEADERS="$cors_headers" VOICE_WEB_ORIGIN="$voice_web_origin" node --input-type=module <<'JS'
const headers = new Headers();
for (const line of process.env.CORS_HEADERS.split(/\r?\n/)) {
  const colon = line.indexOf(':');
  if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
}
const origin = headers.get('access-control-allow-origin');
const methods = headers.get('access-control-allow-methods')?.toLowerCase().split(',').map(value => value.trim());
const allowed = headers.get('access-control-allow-headers')?.toLowerCase().split(',').map(value => value.trim());
if (!['*', process.env.VOICE_WEB_ORIGIN].includes(origin) || !methods?.includes('post') || !allowed?.includes('content-type') || !allowed?.includes('authorization')) process.exitCode = 1;
JS
then
  echo "Voice CORS preflight does not permit hosted JSON requests." >&2
  exit 1
fi

voice_status="$(curl --silent --show-error --max-time 35 --output /dev/null --write-out "%{http_code}" --request POST --header 'Content-Type: application/json' --data '{}' "$api_url/voice/expense")"
if [[ "$voice_status" != "401" ]]; then
  echo "Anonymous voice malformed-request check returned HTTP $voice_status instead of 401." >&2
  exit 1
fi

if [[ "$stage" == "dev" ]]; then
  pool_id="$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$deployment_region" --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue | [0]" --output text)"
  client_id="$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$deployment_region" --query "Stacks[0].Outputs[?OutputKey=='CognitoClientId'].OutputValue | [0]" --output text)"
  COGNITO_USER_POOL_ID="$pool_id" COGNITO_CLIENT_ID="$client_id" AWS_REGION="$deployment_region" pnpm exec tsx scripts/check-voice-auth.ts "$api_url"
  COGNITO_USER_POOL_ID="$pool_id" COGNITO_CLIENT_ID="$client_id" AWS_REGION="$deployment_region" pnpm exec tsx scripts/check-sync.ts "$api_url"
fi

echo "Deployment and smoke tests succeeded. Stack outputs are in $outputs_file."

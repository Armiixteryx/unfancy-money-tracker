#!/usr/bin/env bash
set -euo pipefail

# The Git branch owns the target, including HTML/install branding. Cloud URLs
# and public Cognito identifiers are configured as Amplify branch variables.
case "${AWS_BRANCH:-}" in
  production)
    export EXPO_PUBLIC_ENV=prod
    [[ "${EXPO_PUBLIC_VOICE_BACKEND:-}" == prod ]] || { echo 'Production requires its production backend configuration.' >&2; exit 1; }
    ;;
  main)
    export EXPO_PUBLIC_ENV=dev
    [[ "${EXPO_PUBLIC_VOICE_BACKEND:-}" == dev ]] || { echo 'Main requires its development backend configuration.' >&2; exit 1; }
    ;;
  demo)
    export EXPO_PUBLIC_ENV=demo
    # Defense in depth: demo has no usable cloud identifiers or destinations.
    export EXPO_PUBLIC_COGNITO_USER_POOL_ID='' EXPO_PUBLIC_COGNITO_CLIENT_ID=''
    export EXPO_PUBLIC_SYNC_API_URL='' EXPO_PUBLIC_EXCHANGE_RATE_API_URL=''
    export EXPO_PUBLIC_VOICE_BACKEND=dev EXPO_PUBLIC_VOICE_DEV_API_URL=''
    export EXPO_PUBLIC_VOICE_PROD_API_URL='' EXPO_PUBLIC_VOICE_API_URL=''
    export EXPO_PUBLIC_POSTHOG_API_KEY=''
    ;;
  *) echo 'Unsupported Amplify deployment branch.' >&2; exit 1 ;;
esac

# Expo's public variables are compiled into Metro output; never reuse transforms
# from another environment or load a developer's local dotenv file.
export EXPO_NO_DOTENV=1
pnpm exec expo export --platform web --clear

ifndef UNFANCY_WORKSPACE_ROOT
$(error Use pnpm run local:build so the existing pnpm dependencies are available)
endif

build-SyncFunction:
	"$(UNFANCY_WORKSPACE_ROOT)/node_modules/.bin/esbuild" "$(UNFANCY_WORKSPACE_ROOT)/src/server/handlers/sync.ts" --bundle --platform=node --target=node24 --sourcemap --outfile="$(ARTIFACTS_DIR)/src/server/handlers/sync.js"

build-TrackerRelayFunction:
	"$(UNFANCY_WORKSPACE_ROOT)/node_modules/.bin/esbuild" "$(UNFANCY_WORKSPACE_ROOT)/src/server/handlers/trackerRelay.ts" --bundle --platform=node --target=node24 --sourcemap --outfile="$(ARTIFACTS_DIR)/src/server/handlers/trackerRelay.js"

build-ExchangeRateFunction:
	"$(UNFANCY_WORKSPACE_ROOT)/node_modules/.bin/esbuild" "$(UNFANCY_WORKSPACE_ROOT)/src/server/handlers/exchangeRates.ts" --bundle --platform=node --target=node24 --sourcemap --outfile="$(ARTIFACTS_DIR)/src/server/handlers/exchangeRates.js"

build-VoiceExpenseFunction:
	"$(UNFANCY_WORKSPACE_ROOT)/node_modules/.bin/esbuild" "$(UNFANCY_WORKSPACE_ROOT)/src/server/handlers/voiceExpense.ts" --bundle --platform=node --target=node24 --sourcemap --outfile="$(ARTIFACTS_DIR)/src/server/handlers/voiceExpense.js"

#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { UnfancyMoneyTrackerStack } from "../lib/unfancy-money-tracker-stack";

const app = new cdk.App();
const deploymentStage = app.node.tryGetContext("stage");
if (deploymentStage !== "dev" && deploymentStage !== "prod") {
  throw new Error("CDK context 'stage' must be either 'dev' or 'prod'. Use -c stage=dev or -c stage=prod.");
}

new UnfancyMoneyTrackerStack(app, `UnfancyMoneyTracker-${deploymentStage}`, {
  deploymentStage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
  },
  description: `Unfancy Money Tracker ${deploymentStage} AWS boundary.`
});

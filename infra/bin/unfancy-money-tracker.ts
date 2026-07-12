#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { UnfancyMoneyTrackerStack } from "../lib/unfancy-money-tracker-stack";

const app = new cdk.App();

new UnfancyMoneyTrackerStack(app, "UnfancyMoneyTracker", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
  },
  description: "Unfancy Money Tracker AWS boundary; synthesize only until the local-first workflow is stable."
});

import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import { UnfancyMoneyTrackerStack } from "./unfancy-money-tracker-stack";

describe("UnfancyMoneyTrackerStack", () => {
  it("uses a throttled DynamoDB serverless boundary without relational networking", () => {
    const app = new cdk.App({ context: { stage: "dev" } });
    const stack = new UnfancyMoneyTrackerStack(app, "Test-dev", { deploymentStage: "dev" });
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 10
      },
      SSESpecification: { SSEEnabled: false }
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "$default",
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 10,
        ThrottlingRateLimit: 5
      }
    });
    for (const resourceType of [
      "AWS::RDS::DBCluster",
      "AWS::RDS::DBProxy",
      "AWS::EC2::VPC",
      "AWS::EC2::NatGateway",
      "AWS::SecretsManager::Secret",
      "AWS::KMS::Key"
    ]) {
      template.resourceCountIs(resourceType, 0);
    }
  });

  it("retains and protects the future production table with recovery enabled", () => {
    const app = new cdk.App({ context: { stage: "prod" } });
    const stack = new UnfancyMoneyTrackerStack(app, "Test-prod", { deploymentStage: "prod" });
    const template = Template.fromStack(stack);

    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: Match.objectLike({
        DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
          RecoveryPeriodInDays: 35
        }
      })
    });
    expect(template.findResources("AWS::DynamoDB::Table")).toBeTruthy();
  });
});

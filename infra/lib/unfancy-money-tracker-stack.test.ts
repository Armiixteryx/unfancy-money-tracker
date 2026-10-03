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
    template.resourceCountIs("AWS::SecretsManager::Secret", 1);
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "POST /voice/expense", AuthorizationType: "NONE" });
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", { RouteSettings: { "POST /voice/expense": { ThrottlingRateLimit: 0.25, ThrottlingBurstLimit: 2 } } });
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

it("grants voice secret read access only to the dedicated voice role", () => {
  const app=new cdk.App({context:{stage:"dev"}});
  const template=Template.fromStack(new UnfancyMoneyTrackerStack(app,"VoiceIAM-dev",{deploymentStage:"dev"}));
  const policies=template.findResources("AWS::IAM::Policy");
  const readers=Object.values(policies).filter(resource=>JSON.stringify(resource.Properties.PolicyDocument).includes("secretsmanager:GetSecretValue"));
  expect(readers).toHaveLength(1);
  expect(JSON.stringify(readers[0]?.Properties.Roles)).toContain("VoiceExpenseFunctionServiceRole");
  expect(JSON.stringify(readers[0]?.Properties.PolicyDocument)).toContain("VoiceSecret");
  template.hasResource("AWS::SecretsManager::Secret",{DeletionPolicy:"Retain",UpdateReplacePolicy:"Retain"});
});

import * as cdk from "aws-cdk-lib";
import { Match,Template } from "aws-cdk-lib/assertions";
import { describe,expect,it } from "vitest";
import { PostgresStack } from "./postgres-stack";
import { UnfancyMoneyTrackerStack } from "./unfancy-money-tracker-stack";
function templates(stage:"dev" | "prod"="dev",developmentConcurrencyMode?: "shared" | "reserved") {
  const app=new cdk.App({ context:{ stage } });
  const postgres=new PostgresStack(app,`Database-${stage}`,{ deploymentStage:stage,developmentConcurrencyMode });
  const services=new UnfancyMoneyTrackerStack(app,`Services-${stage}`,{ deploymentStage:stage,postgres });
  return { database:Template.fromStack(postgres),services:Template.fromStack(services) };
}
describe("portable PostgreSQL boundary",() => {
  it("uses private Single-AZ encrypted RDS, separate roles, and no NAT, proxy, or DynamoDB",() => {
    const { database,services }=templates("dev","shared");
    for (const template of [database,services]) for (const type of ["AWS::DynamoDB::Table","AWS::EC2::NatGateway","AWS::RDS::DBProxy"]) template.resourceCountIs(type,0);
    database.hasResourceProperties("AWS::RDS::DBInstance",{ DBInstanceClass:"db.t3.micro",Engine:"postgres",EngineVersion:"18.6",AllocatedStorage:"20",StorageType:"gp3",StorageEncrypted:true,MultiAZ:false,PubliclyAccessible:false,BackupRetentionPeriod:1 });
    database.hasResourceProperties("AWS::RDS::DBParameterGroup", { Family: "postgres18", Parameters: {
      "rds.force_ssl": "1", log_statement: "none", log_min_duration_statement: "-1",
      log_min_error_statement: "panic", log_min_messages: "fatal", log_error_verbosity: "terse",
      log_parameter_max_length: "0", log_parameter_max_length_on_error: "0",
      log_disconnections: "0", log_connections: Match.absent()
    } });
    database.hasResourceProperties("AWS::EC2::VPCEndpoint",{ VpcEndpointType:"Interface",PrivateDnsEnabled:true,ServiceName:Match.anyValue() });
    database.resourceCountIs("AWS::SecretsManager::Secret",3);
    database.hasResourceProperties("AWS::Lambda::Function",{ Runtime:"java21",ReservedConcurrentExecutions:Match.absent(),VpcConfig:Match.objectLike({ SubnetIds:Match.anyValue() }) });
    for (const template of [database,services]) {
      for (const resource of Object.values(template.findResources("AWS::Lambda::Function"))) {
        if (resource.Properties.Environment?.Variables?.SYNC_WORKER_FUNCTION_NAME) continue;
        expect(resource.Properties.ReservedConcurrentExecutions).toBeUndefined();
      }
    }
    services.hasResourceProperties("AWS::ApiGatewayV2::Route",{ RouteKey:"POST /sync/bootstrap",AuthorizationType:"JWT",AuthorizationScopes:["aws.cognito.signin.user.admin"] });
    const publicRate=Object.values(services.findResources("AWS::Lambda::Function")).find(resource => resource.Properties.Environment.Variables.RATE_CACHE_FUNCTION_NAME);
    expect(publicRate?.Properties.VpcConfig).toBeUndefined();
    services.resourceCountIs("AWS::Lambda::Url",0);
  });
  it("keeps Cognito resource logical identities and auth settings",() => {
    const { services }=templates();
    expect(Object.keys(services.findResources("AWS::Cognito::UserPool"))).toEqual(["UserPool6BA7E5F2"]);
    services.hasResourceProperties("AWS::Cognito::UserPoolClient",{ AccessTokenValidity:15,IdTokenValidity:15,EnableTokenRevocation:true,ExplicitAuthFlows:["ALLOW_USER_SRP_AUTH"] });
    services.hasResourceProperties("AWS::ApiGatewayV2::Route",{ RouteKey:"POST /voice/expense",AuthorizationScopes:["aws.cognito.signin.user.admin"] });
  });
  it("protects production database and scopes invocation and secrets",() => {
    const { database,services }=templates("prod");
    database.hasResource("AWS::RDS::DBInstance",{ DeletionPolicy:"Snapshot",Properties:Match.objectLike({ DeletionProtection:true,BackupRetentionPeriod:1 }) });
    database.hasResourceProperties("AWS::Lambda::Function",{ Runtime:"java21",ReservedConcurrentExecutions:1 });
    services.hasResourceProperties("AWS::Lambda::Function",{ ReservedConcurrentExecutions:5 });
    services.hasResourceProperties("AWS::Lambda::Function",{ ReservedConcurrentExecutions:2 });
    const policies=Object.values(services.findResources("AWS::IAM::Policy"));
    const invoke=policies.filter(resource => JSON.stringify(resource.Properties.PolicyDocument).includes("lambda:InvokeFunction"));
    expect(invoke).toHaveLength(3);
    const invokeRoles=JSON.stringify(invoke.map(resource => resource.Properties.Roles));
    expect(invokeRoles).toContain("ExchangeRateFunctionServiceRole");
    expect(invokeRoles).toContain("TrackerRelayFunctionServiceRole");
    expect(invokeRoles).toContain("VoiceExpenseFunctionServiceRole");
    const relay=Object.values(services.findResources("AWS::Lambda::Function")).find(resource => resource.Properties.Handler?.includes("trackerRelay"));
    expect(relay?.Properties.VpcConfig).toBeUndefined();
    expect(relay?.Properties.Environment.Variables.DB_SECRET_ARN).toBeUndefined();
    expect(relay?.Properties.Environment.Variables.DATABASE_URL).toBeUndefined();
    const voice=policies.filter(resource => JSON.stringify(resource.Properties.PolicyDocument).includes("VoiceSecret"));
    expect(voice).toHaveLength(1); expect(JSON.stringify(voice[0]?.Properties.Roles)).toContain("VoiceExpenseFunctionServiceRole");
  });
  it("restores development reservations explicitly and rejects a shared production database",() => {
    const { database,services }=templates("dev","reserved");
    database.hasResourceProperties("AWS::Lambda::Function",{ ReservedConcurrentExecutions:1 });
    services.hasResourceProperties("AWS::Lambda::Function",{ ReservedConcurrentExecutions:5 });
    services.hasResourceProperties("AWS::Lambda::Function",{ ReservedConcurrentExecutions:2 });
    expect(() => new PostgresStack(new cdk.App(),"InvalidProduction",{ deploymentStage:"prod",developmentConcurrencyMode:"shared" })).toThrow("only supported in development");
  });
});

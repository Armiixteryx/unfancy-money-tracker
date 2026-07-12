import * as path from "node:path";

import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ses from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";

export class UnfancyMoneyTrackerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sesFromEmail = new cdk.CfnParameter(this, "SesFromEmail", {
      type: "String",
      description: "A verified SES email identity used by Cognito confirmation and password recovery.",
      default: "no-reply@example.invalid"
    });
    const sesIdentity = new ses.EmailIdentity(this, "CognitoSesIdentity", { identity: ses.Identity.email(sesFromEmail.valueAsString) });

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${this.stackName}-users`,
      signInAliases: { email: true },
      autoVerify: { email: true },
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withSES({ fromEmail: sesFromEmail.valueAsString, fromName: "Unfancy Money Tracker" }),
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    new cdk.CfnOutput(this, "SesIdentityArn", { value: sesIdentity.emailIdentityArn });
    const userPoolClient = userPool.addClient("MobileAndWebClient", {
      userPoolClientName: `${this.stackName}-client`,
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: { userPassword: true, userSrp: true },
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1)
    });

    const encryptionKey = new kms.Key(this, "ApplicationKey", {
      alias: `${this.stackName}/application`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    const vpc = new ec2.Vpc(this, "ApplicationVpc", { maxAzs: 2, natGateways: 1 });
    const databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", { vpc, description: "Aurora accepts traffic only from the RDS Proxy." });
    const proxySecurityGroup = new ec2.SecurityGroup(this, "ProxySecurityGroup", { vpc, description: "RDS Proxy accepts traffic only from sync Lambdas." });
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSecurityGroup", { vpc, description: "Private Lambda network interfaces for the API boundary." });
    databaseSecurityGroup.addIngressRule(proxySecurityGroup, ec2.Port.tcp(5432), "RDS Proxy to Aurora");
    proxySecurityGroup.addIngressRule(lambdaSecurityGroup, ec2.Port.tcp(5432), "Sync Lambda to RDS Proxy");

    const cluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_16_4 }),
      writer: rds.ClusterInstance.serverlessV2("writer"),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      credentials: rds.Credentials.fromGeneratedSecret("unfancy_app", { encryptionKey, secretName: `${this.stackName}/database` }),
      defaultDatabaseName: "unfancy",
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [databaseSecurityGroup],
      backup: { retention: cdk.Duration.days(7) },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    const proxy = cluster.addProxy("AuroraProxy", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [proxySecurityGroup],
      secrets: [cluster.secret!],
      requireTLS: true,
      debugLogging: false
    });

    const syncFunction = this.createLambda("SyncFunction", "src/server/handlers/sync.ts", vpc, lambdaSecurityGroup, {
      DB_PROXY_ENDPOINT: proxy.endpoint,
      DB_SECRET_ARN: cluster.secret!.secretArn,
      DB_NAME: "unfancy",
      APP_ENV: "cloud"
    });
    const exchangeRateFunction = this.createLambda("ExchangeRateFunction", "src/server/handlers/exchangeRates.ts", vpc, lambdaSecurityGroup, { APP_ENV: "cloud" });
    cluster.secret!.grantRead(syncFunction);

    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer("CognitoJwtAuthorizer", issuer, { jwtAudience: [userPoolClient.userPoolClientId] });
    const api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${this.stackName}-api`,
      defaultAuthorizer: jwtAuthorizer,
      corsPreflight: { allowHeaders: ["authorization", "content-type"], allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST], allowOrigins: ["*"] }
    });
    const syncIntegration = new integrations.HttpLambdaIntegration("SyncIntegration", syncFunction);
    for (const route of ["/sync/push", "/sync/pull", "/sync/conflicts/resolve"]) {
      api.addRoutes({ path: route, methods: [apigwv2.HttpMethod.POST], integration: syncIntegration });
    }
    api.addRoutes({ path: "/rates", methods: [apigwv2.HttpMethod.GET], integration: new integrations.HttpLambdaIntegration("ExchangeRateIntegration", exchangeRateFunction) });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "CognitoUserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "CognitoClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "DatabaseProxyEndpoint", { value: proxy.endpoint });
    new cdk.CfnOutput(this, "MigrationSource", { value: "docker/postgres/migrations/*.sql" });
  }

  private createLambda(id: string, entry: string, vpc: ec2.Vpc, securityGroup: ec2.SecurityGroup, environment: Record<string, string>): NodejsFunction {
    const logGroup = new logs.LogGroup(this, `${id}LogGroup`, { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.RETAIN });
    return new NodejsFunction(this, id, {
      entry: path.join(__dirname, "../..", entry),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [securityGroup],
      environment,
      logGroup,
      bundling: { minify: false, sourceMap: true, target: "es2022" }
    });
  }
}

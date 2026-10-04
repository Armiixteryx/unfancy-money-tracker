import * as path from "node:path";

import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export type DeploymentStage = "dev" | "prod";

export interface UnfancyMoneyTrackerStackProps extends cdk.StackProps {
  deploymentStage: DeploymentStage;
}

export class UnfancyMoneyTrackerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: UnfancyMoneyTrackerStackProps) {
    super(scope, id, props);
    const isProduction = props.deploymentStage === "prod";
    const retainedRemovalPolicy = isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    cdk.Tags.of(this).add("Application", "UnfancyMoneyTracker");
    cdk.Tags.of(this).add("Environment", props.deploymentStage);

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${this.stackName}-users`,
      signInAliases: { email: true },
      autoVerify: { email: true },
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withCognito(),
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true },
      deletionProtection: isProduction,
      removalPolicy: retainedRemovalPolicy
    });
    const userPoolClient = userPool.addClient("MobileAndWebClient", {
      userPoolClientName: `${this.stackName}-client`,
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: { userSrp: true },
      refreshTokenValidity: cdk.Duration.days(30),
      enableTokenRevocation: true,
      refreshTokenRotationGracePeriod: cdk.Duration.seconds(30),
      disableOAuth: true,
      accessTokenValidity: cdk.Duration.minutes(15),
      idTokenValidity: cdk.Duration.minutes(15)
    });

    const syncTable = new dynamodb.Table(this, "SyncTable", {
      tableName: `${this.stackName}-sync`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 10,
      tableClass: dynamodb.TableClass.STANDARD,
      encryption: dynamodb.TableEncryption.DEFAULT,
      pointInTimeRecoverySpecification: isProduction
        ? { pointInTimeRecoveryEnabled: true, recoveryPeriodInDays: 35 }
        : undefined,
      deletionProtection: isProduction,
      removalPolicy: retainedRemovalPolicy
    });

    const syncFunction = this.createLambda("SyncFunction", "src/server/handlers/sync.ts", {
      SYNC_TABLE_NAME: syncTable.tableName,
      APP_ENV: props.deploymentStage
    });
    const exchangeRateFunction = this.createLambda("ExchangeRateFunction", "src/server/handlers/exchangeRates.ts", { APP_ENV: props.deploymentStage });
    syncTable.grantReadWriteData(syncFunction);
    const voiceSecret = new secretsmanager.Secret(this, "VoiceSecret", {
      secretName: `UnfancyMoneyTracker-${props.deploymentStage}/voice`,
      description: "Backend-only voice provider credentials; populated by the development deployment script",
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    const voiceFunction = this.createLambda("VoiceExpenseFunction", "src/server/handlers/voiceExpense.ts", {
      COGNITO_USER_POOL_ID: userPool.userPoolId, COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      APP_ENV: props.deploymentStage, VOICE_SECRET_ARN: voiceSecret.secretArn,
      VOICE_CATEGORY_CONFIDENCE: "0.70", VOICE_CURRENCY_CONFIDENCE: "0.80"
    });
    voiceSecret.grantRead(voiceFunction);

    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer("CognitoJwtAuthorizer", issuer, { jwtAudience: [userPoolClient.userPoolClientId] });
    const api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${this.stackName}-api`,
      defaultAuthorizer: jwtAuthorizer,
      createDefaultStage: false,
      corsPreflight: { allowHeaders: ["authorization", "content-type"], allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST], allowOrigins: ["*"] }
    });
    const syncIntegration = new integrations.HttpLambdaIntegration("SyncIntegration", syncFunction);
    for (const route of ["/sync/push", "/sync/pull", "/sync/conflicts/resolve"]) {
      api.addRoutes({ path: route, methods: [apigwv2.HttpMethod.POST], integration: syncIntegration });
    }
    api.addRoutes({
      path: "/rates",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ExchangeRateIntegration", exchangeRateFunction),
      authorizer: new apigwv2.HttpNoneAuthorizer()
    });
    const voiceRoutes = api.addRoutes({
      path: "/voice/expense", methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("VoiceExpenseIntegration", voiceFunction),
      authorizer: jwtAuthorizer, authorizationScopes: ["aws.cognito.signin.user.admin"]
    });
    const stage = new apigwv2.HttpStage(this, "DefaultStage", {
      httpApi: api,
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 5, burstLimit: 10 }
    });

    // RouteSettings use a literal route key, so CloudFormation cannot infer this dependency.
    stage.node.addDependency(...voiceRoutes);
    (stage.node.defaultChild as apigwv2.CfnStage).addPropertyOverride("RouteSettings", {
      "POST /voice/expense": { ThrottlingRateLimit: 0.25, ThrottlingBurstLimit: 2 }
    });
    new cdk.CfnOutput(this, "VoiceSecretArn", { value: voiceSecret.secretArn });
    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "CognitoUserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "CognitoClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoRegion", { value: this.region });
    new cdk.CfnOutput(this, "DeploymentStage", { value: props.deploymentStage });
    new cdk.CfnOutput(this, "SyncTableName", { value: syncTable.tableName });
  }

  private createLambda(id: string, entry: string, environment: Record<string, string>): NodejsFunction {
    const isProduction = this.node.tryGetContext("stage") === "prod";
    const logGroup = new logs.LogGroup(this, `${id}LogGroup`, {
      retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });
    return new NodejsFunction(this, id, {
      entry: path.join(__dirname, "../..", entry),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(29),
      environment,
      logGroup,
      bundling: { minify: false, sourceMap: true, target: "es2022" }
    });
  }
}

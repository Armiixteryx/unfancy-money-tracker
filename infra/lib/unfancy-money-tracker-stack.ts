import * as path from "node:path";

import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { PostgresStack } from "./postgres-stack";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export type DeploymentStage = "dev" | "prod";

export interface UnfancyMoneyTrackerStackProps extends cdk.StackProps {
  deploymentStage: DeploymentStage;
  postgres: PostgresStack;
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

    const database=props.postgres;
    if (isProduction && database.sharedDevelopmentConcurrency) throw new Error("Production requires reserved concurrency");
    const privateOptions={ vpc:database.vpc,vpcSubnets:{ subnetType:ec2.SubnetType.PRIVATE_ISOLATED },securityGroups:[database.workerSecurityGroup] };
    const connection={ PGHOST:database.database.dbInstanceEndpointAddress,PGDATABASE:"unfancy",PG_CA_FILE:"/var/task/rds-global-bundle.pem",APP_ENV:props.deploymentStage,COGNITO_USER_POOL_ID:userPool.userPoolId,COGNITO_CLIENT_ID:userPoolClient.userPoolClientId };
    const syncFunction=this.createLambda("SyncFunction","src/server/handlers/sync.ts",{ ...connection,DB_SECRET_ARN:database.syncSecret.secretArn },{ ...privateOptions,reservedConcurrentExecutions:database.sharedDevelopmentConcurrency ? undefined : 5 });
    const cacheFunction=this.createLambda("RateCacheFunction","src/server/handlers/rateCache.ts",{ ...connection,DB_SECRET_ARN:database.rateSecret.secretArn },{ ...privateOptions,reservedConcurrentExecutions:database.sharedDevelopmentConcurrency ? undefined : 2 });
    database.syncSecret.grantRead(syncFunction); database.rateSecret.grantRead(cacheFunction);
    const exchangeRateFunction=this.createLambda("ExchangeRateFunction","src/server/handlers/exchangeRates.ts",{ APP_ENV:props.deploymentStage,RATE_CACHE_FUNCTION_NAME:cacheFunction.functionName });
    cacheFunction.grantInvoke(exchangeRateFunction);
    const publicAppOrigin = this.node.tryGetContext(isProduction ? "publicAppOriginProd" : "publicAppOriginDev")
      ?? process.env[isProduction ? "PUBLIC_APP_ORIGIN_PROD" : "PUBLIC_APP_ORIGIN_DEV"];
    const trackerRelayEnvironment: Record<string,string> = {
      APP_ENV: props.deploymentStage,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      SYNC_WORKER_FUNCTION_NAME: syncFunction.functionName,
      ...(publicAppOrigin
        ? { PUBLIC_APP_ORIGIN: String(publicAppOrigin) }
        : {}),
    };
    const trackerRelayFunction = this.createLambda("TrackerRelayFunction", "src/server/handlers/trackerRelay.ts", trackerRelayEnvironment, { reservedConcurrentExecutions: database.sharedDevelopmentConcurrency ? undefined : isProduction ? 5 : 3 });
    syncFunction.grantInvoke(trackerRelayFunction);
    trackerRelayFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["cognito-idp:AdminGetUser", "cognito-idp:ListUsers"],
      resources: [userPool.userPoolArn],
    }));
    for (const [name,worker] of [["Sync",syncFunction],["RateCache",cacheFunction]] as const) {
      new cloudwatch.Alarm(this,`${name}ErrorsAlarm`,{ metric:worker.metricErrors(),threshold:1,evaluationPeriods:1 });
      new cloudwatch.Alarm(this,`${name}ThrottlesAlarm`,{ metric:worker.metricThrottles(),threshold:1,evaluationPeriods:1 });
      new cloudwatch.Alarm(this,`${name}ConnectionLatencyAlarm`,{ metric:new cloudwatch.Metric({ namespace:"Unfancy/Database",metricName:"ConnectionLatency",dimensionsMap:{ Worker:name },statistic:"p95",period:cdk.Duration.minutes(5) }),threshold:2000,evaluationPeriods:2 });
    }
    const voiceSecret = new secretsmanager.Secret(this, "VoiceSecret", {
      secretName: `UnfancyMoneyTracker-${props.deploymentStage}/voice`,
      description: "Backend-only voice provider credentials; populated by the approved stage deployment script",
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    const voiceFunction = this.createLambda("VoiceExpenseFunction", "src/server/handlers/voiceExpense.ts", {
      COGNITO_USER_POOL_ID: userPool.userPoolId, COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      APP_ENV: props.deploymentStage, VOICE_SECRET_ARN: voiceSecret.secretArn,
      SYNC_WORKER_FUNCTION_NAME: syncFunction.functionName,
      VOICE_CATEGORY_CONFIDENCE: "0.70", VOICE_CURRENCY_CONFIDENCE: "0.80"
    });
    syncFunction.grantInvoke(voiceFunction);
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
    for (const route of ["/sync/push", "/sync/pull", "/sync/conflicts/resolve", "/sync/bootstrap", "/sync/v2/push", "/sync/v2/pull", "/sync/v2/conflicts/resolve"]) {
      api.addRoutes({ path: route, methods: [apigwv2.HttpMethod.POST], integration: syncIntegration, authorizationScopes:["aws.cognito.signin.user.admin"] });
    }
    const trackerRoutes = ["list", "create", "rename", "archive", "restore", "leave", "members", "role", "remove", "invite", "revoke-invitation", "preview-invitation", "accept-invitation"];
    const trackerIntegration = new integrations.HttpLambdaIntegration("TrackerRelayIntegration", trackerRelayFunction);
    for (const route of trackerRoutes) {
      api.addRoutes({ path: `/trackers/${route}`, methods: [apigwv2.HttpMethod.POST], integration: trackerIntegration, authorizationScopes: ["aws.cognito.signin.user.admin"] });
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

  }

  private createLambda(id: string, entry: string, environment: Record<string, string>, options: Partial<lambda.FunctionOptions> = {}): NodejsFunction {
    const isProduction = this.node.tryGetContext("stage") === "prod";
    const logGroup = new logs.LogGroup(this, `${id}LogGroup`, {
      retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
    });
    return new NodejsFunction(this, id, {
      ...options,
      entry: path.join(__dirname, "../..", entry),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(29),
      environment,
      logGroup,
      bundling: { minify:false,sourceMap:true,target:"es2022",commandHooks:{
        beforeBundling:() => [],beforeInstall:() => [],
        afterBundling:(inputDir,outputDir) => [`cp "${inputDir}/db/certs/rds-global-bundle.pem" "${outputDir}/rds-global-bundle.pem"`]
      } }
    });
  }
}

import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export class PostgresStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly workerSecurityGroup: ec2.SecurityGroup;
  readonly database: rds.DatabaseInstance;
  readonly syncSecret: secretsmanager.Secret;
  readonly rateSecret: secretsmanager.Secret;
  readonly migrationFunction: lambda.Function;
  readonly sharedDevelopmentConcurrency: boolean;
  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps & { deploymentStage: "dev" | "prod"; developmentConcurrencyMode?: "shared" | "reserved" },
  ) {
    super(scope, id, props);
    const production = props.deploymentStage === "prod";
    // AWS rejected seven-day retention for this development account. The user
    // approved a one-day recovery window; production retains seven days.
    const backupRetentionDays = production ? 7 : 1;
    if (production && props.developmentConcurrencyMode === "shared") {
      throw new Error("Shared concurrency is only supported in development");
    }
    this.sharedDevelopmentConcurrency = !production && props.developmentConcurrencyMode === "shared";
    cdk.Tags.of(this).add("Application", "UnfancyMoneyTracker");
    cdk.Tags.of(this).add("Environment", props.deploymentStage);
    this.vpc = new ec2.Vpc(this, "DatabaseVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    this.workerSecurityGroup = new ec2.SecurityGroup(this, "DatabaseWorkers", {
      vpc: this.vpc,
    });
    const databaseSecurityGroup = new ec2.SecurityGroup(
      this,
      "DatabaseSecurityGroup",
      { vpc: this.vpc },
    );
    databaseSecurityGroup.addIngressRule(
      this.workerSecurityGroup,
      ec2.Port.tcp(5432),
    );
    const endpointSecurityGroup = new ec2.SecurityGroup(
      this,
      "SecretsEndpointSecurityGroup",
      { vpc: this.vpc },
    );
    endpointSecurityGroup.addIngressRule(
      this.workerSecurityGroup,
      ec2.Port.tcp(443),
    );
    this.vpc.addInterfaceEndpoint("SecretsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });
    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.of("18.6", "18"),
    });
    const parameterGroup = new rds.ParameterGroup(this, "PostgresParameters", {
      engine,
      parameters: {
        "rds.force_ssl": "1",
        log_statement: "none",
        log_min_duration_statement: "-1",
        log_min_error_statement: "panic",
        // Ordinary constraint errors can contain row values even without SQL.
        log_min_messages: "fatal",
        log_error_verbosity: "terse",
        log_parameter_max_length: "0",
        log_parameter_max_length_on_error: "0",
        // PostgreSQL 18 disables connection logging by default. RDS rejects an
        // explicit empty value (and the legacy 0), so retain the engine default.
        log_disconnections: "0",
      },
    });
    this.database = new rds.DatabaseInstance(this, "PostgresDatabase", {
      engine,
      parameterGroup,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      databaseName: "unfancy",
      credentials: rds.Credentials.fromGeneratedSecret("unfancy_migrations"),
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      publiclyAccessible: false,
      backupRetention: cdk.Duration.days(backupRetentionDays),
      autoMinorVersionUpgrade: false,
      deletionProtection: production,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      // Query diagnostics are deliberately disabled because financial parameters are sensitive.
      enablePerformanceInsights: false,
    });
    cdk.Tags.of(this.database).add("created_by", "rds-oss-skill");
    cdk.Tags.of(this.database).add("generation_model", "gpt-6");
    this.syncSecret = this.createRoleSecret(
      "SyncDatabaseSecret",
      "unfancy_sync",
    );
    this.rateSecret = this.createRoleSecret(
      "RateDatabaseSecret",
      "unfancy_rates",
    );
    const logGroup = new logs.LogGroup(this, "MigrationLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.migrationFunction = new lambda.Function(this, "MigrationFunction", {
      runtime: lambda.Runtime.JAVA_21,
      handler: "com.unfancy.migrations.Handler::handleRequest",
      code: lambda.Code.fromAsset(
        path.join(
          __dirname,
          "../../db/migration-lambda/target/migrations-1.0.0.jar",
        ),
      ),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      reservedConcurrentExecutions: this.sharedDevelopmentConcurrency ? undefined : 1,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.workerSecurityGroup],
      logGroup,
      environment: {
        PGHOST: this.database.dbInstanceEndpointAddress,
        PGDATABASE: "unfancy",
        DB_SECRET_ARN: this.database.secret!.secretArn,
        SYNC_SECRET_ARN: this.syncSecret.secretArn,
        RATE_SECRET_ARN: this.rateSecret.secretArn,
      },
    });
    this.database.secret!.grantRead(this.migrationFunction);
    this.syncSecret.grantRead(this.migrationFunction);
    this.rateSecret.grantRead(this.migrationFunction);
    new cloudwatch.Alarm(this, "DatabaseConnectionsAlarm", {
      metric: this.database.metricDatabaseConnections(),
      threshold: 30,
      evaluationPeriods: 2,
    });
    new cloudwatch.Alarm(this, "DatabaseCpuAlarm", {
      metric: this.database.metricCPUUtilization(),
      threshold: 80,
      evaluationPeriods: 3,
    });
    new cloudwatch.Alarm(this, "DatabaseMemoryAlarm", {
      metric: this.database.metricFreeableMemory(),
      threshold: 128 * 1024 * 1024,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 3,
    });
    new cdk.CfnOutput(this, "MigrationFunctionName", {
      value: this.migrationFunction.functionName,
    });
    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: this.database.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "DatabaseIdentifier", {
      value: this.database.instanceIdentifier,
    });
  }
  private createRoleSecret(id: string, username: string) {
    return new secretsmanager.Secret(this, id, {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username }),
        generateStringKey: "password",
        passwordLength: 40,
        excludePunctuation: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }
}

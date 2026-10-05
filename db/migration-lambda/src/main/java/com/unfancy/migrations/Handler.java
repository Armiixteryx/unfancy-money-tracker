package com.unfancy.migrations;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.logging.Log;
import org.flywaydb.core.api.logging.LogCreator;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

public final class Handler implements RequestHandler<Map<String,Object>, Map<String,Object>> {
  private static final SecretsManagerClient secrets = SecretsManagerClient.builder().httpClientBuilder(UrlConnectionHttpClient.builder()).build();
  private static final ObjectMapper mapper = new ObjectMapper();
  public static final class QuietLogCreator implements LogCreator {
    public QuietLogCreator() {}
    @Override public Log createLogger(Class<?> ignored) { return new QuietLog(); }
  }
  private static final class QuietLog implements Log {
    @Override public void debug(String ignored) {}
    @Override public void info(String ignored) {}
    @Override public void warn(String ignored) {}
    @Override public void error(String ignored) {}
    @Override public void error(String ignored, Exception cause) {}
    @Override public void notice(String ignored) {}
  }
  private JsonNode credential(String arn) throws Exception { return mapper.readTree(secrets.getSecretValue(r -> r.secretId(arn)).secretString()); }
  public Map<String,Object> handleRequest(Map<String,Object> event, Context context) {
    // Flyway and JDBC errors can contain SQL and values. Only a fixed result leaves this handler.
    Logger.getLogger("org.flywaydb").setLevel(Level.OFF);
    Logger.getLogger("org.postgresql").setLevel(Level.OFF);
    String stage = "request";
    try {
      if (!"migrate".equals(event.get("operation"))) return Map.of("ok",false,"code","invalid_request");
      stage = "ca_load";
      Path ca = Path.of("/tmp/unfancy-rds-ca.pem");
      try (var input = Handler.class.getResourceAsStream("/certs/rds-global-bundle.pem")) { Files.copy(input,ca,java.nio.file.StandardCopyOption.REPLACE_EXISTING); }
      stage = "database_credentials";
      var credentials = credential(System.getenv("DB_SECRET_ARN"));
      String url = "jdbc:postgresql://" + System.getenv("PGHOST") + ":5432/" + System.getenv("PGDATABASE") + "?sslmode=verify-full&sslrootcert=" + ca;
      stage = "flyway_configuration";
      var flyway = Flyway.configure().dataSource(url,credentials.get("username").asText(),credentials.get("password").asText())
        .locations("classpath:db/migration").cleanDisabled(true).baselineOnMigrate(false).validateOnMigrate(true).ignoreMigrationPatterns("*:pending")
        .loggers(QuietLogCreator.class.getName()).load();
      stage = "flyway_validation";
      flyway.validate();
      stage = "flyway_migration";
      var result = flyway.migrate();
      // Roles are set explicitly after migrations; never place passwords in SQL files or logs.
      stage = "database_connect";
      try (var connection = DriverManager.getConnection(url,credentials.get("username").asText(),credentials.get("password").asText())) {
        for (String role : new String[]{"unfancy_sync","unfancy_rates"}) {
          stage = "role_credentials";
          JsonNode value = credential(System.getenv(role.equals("unfancy_sync") ? "SYNC_SECRET_ARN" : "RATE_SECRET_ARN"));
          String password = value.get("password").asText().replace("'","''");
          int connectionLimit = role.equals("unfancy_sync") ? 5 : 2;
          stage = "role_configuration";
          try (var statement=connection.createStatement()) { statement.execute("ALTER ROLE " + role + " LOGIN CONNECTION LIMIT " + connectionLimit + " PASSWORD '" + password + "'"); }
        }
        stage = "role_verification";
        try (var statement=connection.createStatement(); var roles=statement.executeQuery("SELECT count(*) FROM pg_roles WHERE NOT rolsuper AND rolcanlogin AND ((rolname='unfancy_sync' AND rolconnlimit=5) OR (rolname='unfancy_rates' AND rolconnlimit=2))")) {
          if (!roles.next() || roles.getInt(1) != 2) throw new IllegalStateException("Role configuration failed");
        }
      }
      return Map.of("ok",true,"migrationsExecuted",result.migrationsExecuted,"roleConnectionLimitsVerified",true);
    } catch (Throwable ignored) {
      if (ignored instanceof VirtualMachineError fatal) throw fatal;
      if (ignored instanceof ThreadDeath fatal) throw fatal;
      return Map.of("ok",false,"code","migration_failed","stage",stage);
    }
  }
}

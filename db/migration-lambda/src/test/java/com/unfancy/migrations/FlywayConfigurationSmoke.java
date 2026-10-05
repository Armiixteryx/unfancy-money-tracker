package com.unfancy.migrations;

import org.flywaydb.core.Flyway;

/** Verifies the exact Flyway startup configuration without a database or credentials. */
public final class FlywayConfigurationSmoke {
  public static void main(String[] args) {
    try {
      Flyway.configure()
          .locations("classpath:db/migration")
          .cleanDisabled(true)
          .baselineOnMigrate(false)
          .validateOnMigrate(true)
          .ignoreMigrationPatterns("*:pending")
          .loggers(Handler.QuietLogCreator.class.getName())
          .load();
    } catch (Throwable ignored) {
      if (ignored instanceof VirtualMachineError fatal) throw fatal;
      if (ignored instanceof ThreadDeath fatal) throw fatal;
      System.err.println("Flyway configuration smoke failed.");
      System.exit(1);
    }
  }
}

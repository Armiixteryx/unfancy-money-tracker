#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD:/workspace" -w /workspace/db/migration-lambda maven:3.9.11-eclipse-temurin-21 sh -c 'mvn -q -DskipTests package && java -cp target/test-classes:target/migrations-1.0.0.jar com.unfancy.migrations.FlywayConfigurationSmoke'

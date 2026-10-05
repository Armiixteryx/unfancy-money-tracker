import { describe, expect, it } from "vitest";
import { portablePoolConfig } from "./postgres";

describe("portable PostgreSQL TLS", () => {
  it("requires a CA outside the explicit local runtime", () => {
    expect(() =>
      portablePoolConfig({
        DATABASE_URL: "postgresql://synthetic.invalid/unfancy",
      }),
    ).toThrow("Verified database TLS is required");
    expect(
      portablePoolConfig({
        APP_ENV: "local",
        DATABASE_URL: "postgresql://localhost/unfancy",
      }).ssl,
    ).toBe(false);
  });
  it.each([
    "sslmode=disable",
    "sslmode=require",
    "sslcert=private",
    "sslrootcert=private",
    "ssl=true",
  ])("rejects URL overrides: %s", (option) => {
    expect(() =>
      portablePoolConfig({
        PG_CA_FILE: "db/certs/rds-global-bundle.pem",
        DATABASE_URL: `postgresql://synthetic.invalid/unfancy?${option}`,
      }),
    ).toThrow("Configure database TLS through PG_CA_FILE");
  });
  it("verifies portable connections using the configured CA", () => {
    expect(
      portablePoolConfig({
        PG_CA_FILE: "db/certs/rds-global-bundle.pem",
        DATABASE_URL: "postgresql://synthetic.invalid/unfancy",
      }).ssl,
    ).toMatchObject({ rejectUnauthorized: true });
  });
});

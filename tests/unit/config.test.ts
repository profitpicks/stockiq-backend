import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../../config/index.js";

describe("Unit: Configuration Module", () => {
  it("should load configuration with valid default values", () => {
    const testConfig = loadConfig({
      NODE_ENV: "test",
      APP_PORT: "4000",
      DB_NAME: "test_stockiq",
    });

    assert.equal(testConfig.nodeEnv, "test");
    assert.equal(testConfig.port, 4000);
    assert.equal(testConfig.database.database, "test_stockiq");
    assert.equal(testConfig.adapters.otpMode, "mock");
    assert.equal(testConfig.adapters.paymentMode, "mock");
    assert.equal(testConfig.adapters.marketDataMode, "mock");
    assert.equal(testConfig.adapters.esignMode, "mock");
    assert.equal(testConfig.adapters.parrvaMode, "mock");
  });

  it("should throw validation error on invalid environment values", () => {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: "invalid_env" as unknown as string,
        });
      },
      {
        message: /Invalid application configuration/,
      }
    );
  });

  it("should reject short JWT secret in production mode", () => {
    assert.throws(
      () => {
        loadConfig({
          JWT_SECRET: "short",
        });
      },
      {
        message: /Invalid application configuration: jwtSecret: String must contain at least 16 character/,
      }
    );
  });
});

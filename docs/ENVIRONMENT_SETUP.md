# stockiq — Environment & Secrets Setup

## 1. Secrets Handling Rules

1. **Never Commit Secrets**: The `.env` file must never be committed to git or shared publicly.
2. **Template**: An example configuration template is maintained at `stockiq/config/env.example`.
3. **Strong Typing & Validation**: All environment variables are validated at startup using `Zod` in `stockiq/config/index.ts`. If required variables are missing or malformed, the process fails fast with a descriptive error.

---

## 2. Configuration Variables Reference

### Application Core
* `NODE_ENV`: Runtime environment (`development` | `test` | `production`).
* `APP_NAME`: Service identifier (default: `stockiq`).
* `APP_PORT`: Port number to listen on (default: `3000`).
* `APP_HOST`: Host interface to bind to (default: `0.0.0.0`).
* `APP_URL`: Public-facing canonical base URL (default: `http://localhost:3000`).

### Security
* `JWT_SECRET`: Minimum 16-character secret for signing authentication tokens.
* `JWT_EXPIRY_SECONDS`: Access token lifetime in seconds (default: `900` = 15 minutes).
* `SESSION_SECRET`: Session signature secret.
* `COOKIE_SECURE`: Enable `Secure` cookie flag (`true` in production with HTTPS, `false` in dev).
* `RATE_LIMIT_WINDOW_MS`: Time window in milliseconds for rate limiter (default: `60000` = 1 minute).
* `RATE_LIMIT_MAX_REQUESTS`: Maximum requests allowed per window per IP (default: `100`).

### PostgreSQL Database
* `DB_HOST`: PostgreSQL server host (default: `localhost`).
* `DB_PORT`: PostgreSQL port (default: `5432`).
* `DB_NAME`: Database name (default: `stockiq_dev`).
* `DB_USER`: PostgreSQL user (default: `stockiq_user`).
* `DB_PASSWORD`: PostgreSQL password.
* `DB_POOL_MIN`: Minimum pool connection count (default: `2`).
* `DB_POOL_MAX`: Maximum pool connection count (default: `10`).
* `DB_SSL`: Enable SSL connection (`true` / `false`).

### Adapters Mode Configuration
* `OTP_ADAPTER_MODE`: `mock` or `live`.
* `PAYMENT_ADAPTER_MODE`: `mock` or `live`.
* `MARKET_DATA_ADAPTER_MODE`: `mock` or `live`.
* `ESIGN_ADAPTER_MODE`: `mock` or `live`.
* `PARRVA_ADAPTER_MODE`: `mock` or `live`.

---

## 3. Local Development Quickstart

```bash
# 1. Enter the stockiq directory
cd stockiq

# 2. Copy the example configuration
cp config/env.example .env

# 3. Install dependencies
npm install

# 4. Run tests
npm test

# 5. Start the development server
npm run dev
```

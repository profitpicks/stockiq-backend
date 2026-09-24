# stockiq — Development Setup & Commands Guide

## 1. Prerequisites
- **Node.js**: v22+ (v22.23.2 or later recommended)
- **PostgreSQL**: v15+ (optional for mock development, required for production persistence)
- **TypeScript**: v5.7+

---

## 2. Available NPM Scripts

All commands are executed from the `stockiq/` directory:

| Command | Description |
| :--- | :--- |
| `npm run start` | Starts the production API server (`tsx api/server.ts`). |
| `npm run dev` | Starts the server with live file-watching (`tsx watch api/server.ts`). |
| `npm test` | Runs the full automated test suite (unit, integration, and e2e). |
| `npm run test:unit` | Executes unit test suites (`tests/unit/*.test.ts`). |
| `npm run test:integration` | Executes integration test suites (`tests/integration/*.test.ts`). |
| `npm run test:e2e` | Executes end-to-end lifecycle test suites (`tests/e2e/*.test.ts`). |
| `npm run typecheck` | Executes TypeScript strict type verification (`tsc --noEmit`). |
| `npm run db:migrate` | Runs database migrations runner against configured PostgreSQL instance. |

---

## 3. Core API Endpoints

Once running, the foundation exposes the following endpoints:

- `GET /health`: Liveness health check (uptime, environment, service name).
- `GET /ready`: Readiness probe (database connectivity and adapter statuses).
- `GET /api/v1`: Root API descriptor with metadata, module list, and architecture summary.
- `GET /api/v1/roles`: Enumerates the 12 platform operational and regulatory roles.
- `GET /api/v1/adapters/status`: Status of external integration adapters.
- `GET /api/v1/admin-check`: RBAC test guard verifying token parsing and role-based access control.

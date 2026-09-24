# stockiq — Database & Migrations Setup

## 1. PostgreSQL Architecture Principles

The `stockiq` persistent store uses PostgreSQL following strict architectural rules:
1. **Migrations-Only Evolution**: Schema changes MUST be performed through forward SQL migration scripts located in `database/migrations/`. Never solve a schema change by deleting and recreating the database.
2. **UUID Primary Identifiers**: All business entity primary keys use UUID v4 (`gen_random_uuid()` / `uuid-ossp`) to avoid enumeration attacks and facilitate decoupled generation.
3. **UTC Timestamps**: All timestamps must be stored as `TIMESTAMP WITH TIME ZONE` in UTC (`NOW() AT TIME ZONE 'UTC'`).
4. **Paise-Denominated Currency**: All monetary values are stored in smallest currency units (paise as `BIGINT`) or `NUMERIC(18, 4)` for high-precision calculations. Floating-point types (`REAL`, `FLOAT`, `DOUBLE PRECISION`) are prohibited for monetary amounts.
5. **Referential Integrity & Constraints**: Strict foreign keys with cascading where appropriate, unique constraints, and check constraints (e.g. valid categories, statuses, and classifications).
6. **Immutable Dual-Ledger Architecture**:
   - `audit_logs`: Records who accessed or modified data with actor ID, IP address, and old/new state snapshots.
   - `business_events`: An append-only ledger of state transitions (recommendations, executions, agreements) with previous-hash and current-hash chaining.

---

## 2. Migration Management

Migrations are stored in:
`database/migrations/<version>_<name>.sql`

Example:
- `001_initial_foundation.sql`: Creates `schema_migrations`, `roles`, `permissions`, `role_permissions`, `users`, `user_profiles`, `user_roles`, `audit_logs`, `data_access_logs`, `business_events`, and `system_settings`.

Seeds are stored in:
`database/seeds/<version>_<name>.sql`

- `001_foundation_roles.sql`: Seeds the 12 platform operational and regulatory roles and default compliance configuration settings.

### Running Migrations Programmatically
```bash
npm run db:migrate
```

### Migration Verification Runner
The `DatabaseMigrator` (`database/migrator.ts`) performs syntactic and safety validation of all migration scripts prior to execution, ensuring migrations contain valid DDL and do not contain prohibited destructive statements like `DROP DATABASE`.

# StockIQ — AI Development Rulebook (Mandatory Development Rules)

> **CRITICAL NOTICE**: This is the primary governance document for all AI agents and developers contributing to StockIQ. Every rule in this document is non-negotiable. Violations of these rules undermine architectural integrity, regulatory compliance, and security guarantees.

---

## SECTION A: EXISTING CODE PROTECTION

1. **NEVER Rewrite the Entire Project**: Full-project rewrites or broad codebase replacements are strictly prohibited. Development must be strictly incremental.
2. **NEVER Replace Working Architecture**: Do not replace the existing Modular Monolith backend, PostgreSQL database, or Jetpack Compose Android client with alternative architectures or frameworks without explicit user direction.
3. **NEVER Delete Existing Working Files**: Do not delete any existing functional file unless explicitly ordered by the user with a specific file path.
4. **NEVER Rename Existing Files**: File renames break import paths, build scripts, and test suites. Do not rename files unless explicitly instructed.
5. **NEVER Modify Completed Phases**: Once a phase or feature is marked COMPLETED, it must remain untouched. Modifying completed phases while implementing a new phase is strictly prohibited unless the current task explicitly requires that modification.
6. **NEVER Refactor Unrelated Code**: Keep changes strictly localized to the files required for the current prompt. Do not reformat, reorganize, or "clean up" adjacent modules or utilities.
7. **NEVER Make "Cleanup" Changes**: Unsolicited cosmetic edits, comment deletions, whitespace realignment, or stylistic modifications outside the requested task are forbidden.
8. **NEVER Duplicate Implementations**: Do not build duplicate services, helpers, or utilities if one already exists in `modules/`, `adapters/`, or `data/`. Always reuse existing implementations.
9. **Mandatory Inspection Before Modification**: You MUST inspect a file's actual contents (`view_file`) before making any edits. Never assume structure or contents based on memory or templates.
10. **Preserve Existing Functionality**: Every existing test, endpoint, model, and workflow must continue working after any code change. Zero regression policy is enforced.

---

## SECTION B: TASK ISOLATION

1. **Work on ONE Requested Task at a Time**: Execute only the specific scope requested by the user. Do not bundle unrequested features or preemptively start subsequent tasks.
2. **Do NOT Implement Future Phases Early**: Roadmap phases marked PLANNED must remain untouched until explicitly scheduled.
3. **Do NOT Add Speculative Features**: Do not add extra configuration flags, unused database columns, theoretical UI screens, or unrequested options to "future-proof" code.
4. **Strict Architectural Partitioning**:
   * If a task is **Android-only**, you MUST NOT edit backend files, database schemas, or backend tests.
   * If a task is **Backend-only**, you MUST NOT edit Android files, UI layouts, or Android Gradle configurations.
5. **Do NOT Modify Database Migrations**: Existing database migration files (`001_...` through `007_...`) are historical records. Do not alter them unless specifically directed to write a new migration.
6. **No Self-Serving Refactoring**: Do not change working completed functionality simply to make a new feature slightly easier to write. Adapt the new code to respect existing boundaries.

---

## SECTION C: AI SAFETY & CONFLICT RESOLUTION

1. **Mandatory Stop on Conflict**: If a user requirement directly conflicts with existing architecture, data schemas, or compliance mandates:
   * **STOP IMMEDIATELY**.
   * Report the exact conflict clearly to the user.
   * Do NOT guess, assume, or make unilateral executive decisions.
2. **No Hallucinated Endpoints**: If an API route or query parameter is uncertain, inspect the actual route definitions in `/stockiq/api/routes/` and backend controllers.
3. **No Hallucinated Database Columns**: If a database column, table name, or data type is uncertain, inspect the actual SQL migrations in `/stockiq/database/migrations/`.
4. **Reuse Verified Modules**: Before creating a new service or class, search the codebase. If an existing module already provides the capability, import and consume it.

---

## SECTION D: FINANCIAL & COMPLIANCE SAFETY

1. **Zero Fabrication of Regulated Data**: You must NEVER fabricate, fake, or simulate:
   * Regulatory registrations or SEBI licenses.
   * SEBI verification status or official certificates.
   * Performance metrics or historical returns.
   * Recommendation track records or win rates.
   * PaRRVA verification badges or certificates.
   * Real-time or historical exchange market data.
   * Investor financial returns or portfolio values.
   * Payment transaction states or gateway settlements.
   * Subscription entitlements or client agreement statuses.
2. **No False PaRRVA Certification**: Never present platform-recorded activity or provider-reported data as PaRRVA-verified. PaRRVA verification requires an official audit certificate issued by a recognized verification agency.
3. **No Claim of SEBI Endorsement**: Never claim or imply in copy, UI, documentation, or metadata that StockIQ is endorsed, certified, accredited, or operated by SEBI.
4. **Dynamic Configuration Over Hardcoding**: Do not hardcode statutory values (such as GST percentages, maximum advisory fee caps, or risk score bands) directly in source code. They must be driven by runtime configuration and database settings.

---

## SECTION E: SECURITY & AUTHORIZATION

1. **Server-Side Authorization is Mandatory**: Every request to a protected endpoint must be authenticated and authorized on the backend. The client application is an untrusted environment.
2. **Client Roles Have Zero Authority**: Selecting a role in the Android UI or web client must NEVER grant access permissions on the server. True roles are retrieved directly from the verified database record.
3. **Secure Session & Token Handling**:
   * JWT tokens must be signed securely with verified secrets.
   * Mobile tokens must be stored in hardware-backed encrypted storage (`SecurePreferences` via Android KeyStore AES-GCM).
   * Plaintext session tokens must never be written to unencrypted logs or preferences.
4. **Prevent Insecure Direct Object References (IDOR)**: Whenever a user accesses a resource (invoice, profile, agreement, recommendation draft), the backend must verify that the authenticated user owns or is authorized to view that specific record.
5. **No Secrets in Source Code**: Never commit API keys, database passwords, JWT private keys, or webhook secrets into Git repositories or hardcoded string literals. Use `.env` and `BuildConfig` injection.
6. **Audit Security Events**: All authentication attempts (success and failure), permission denials, password/OTP resets, and administrative interventions must be logged to the immutable `audit_logs` table.

---

## SECTION F: DATABASE DISCIPLINE

1. **PostgreSQL Exclusively**: PostgreSQL is the sole relational store for production and testing.
2. **UTC Timestamps**: All timestamp columns must be defined as `TIMESTAMP WITH TIME ZONE` (or `TIMESTAMPTZ`) and stored in UTC.
3. **Money in Paise**: All financial amounts (fees, transactions, refunds, GST) must be stored in **paise** (1 INR = 100 paise) as integers or exact decimals.
4. **NUMERIC for Precision Arithmetic**: Use `NUMERIC(18, 4)` for fee ratios, tax percentages, and unit rates. Floating-point numbers (`REAL`, `FLOAT`, `DOUBLE PRECISION`) are strictly prohibited for monetary calculations.
5. **Sequential Migrations**: Database migrations must be strictly sequential (e.g., `001_...`, `002_...`, `003_...`).
6. **NEVER Silently Modify Existing Migrations**: Once a migration has been committed and applied, NEVER modify its contents. Schema adjustments require a new, sequential migration file.
7. **Preserve Existing Data**: Migrations must be non-destructive. Do not drop tables or columns containing production data without an explicit, approved multi-step data migration strategy.

---

## SECTION G: RECOMMENDATION LEDGER INTEGRITY

1. **Verbatim Message Preservation**: The original recommendation text or input dispatched by the provider (`original_message`) must be preserved permanently and immutably, exactly as received.
2. **NO Auto-Publishing by Parsers**: Natural language parsers or automated recommendation extractors must NEVER auto-publish a recommendation. Output must be queued for explicit human review and confirmation by the RA.
3. **Ambiguity Requires Review**: Any recommendation with ambiguous symbols, conflicting stop-loss prices, or unclear target horizons must be flagged for manual provider review.
4. **Corrections are Append-Only Events**: Providers cannot edit or delete a published recommendation. Any correction, price adjustment, or withdrawal must be recorded as a **new, append-only business event** referencing the original record.
5. **Accurate Tamper-Evident Terminology**: Use precise cryptographic terms such as "tamper-evident", "append-only", and "hash-chained". Do NOT make unscientific marketing claims such as "100% tamper-proof" or "unhackable".
6. **Target Milestones (T1/T2/T3) Do Not Inflate Counts**: A recommendation with multiple target prices (T1, T2, T3) represents **one single recommendation**. Hitting T1 and T2 must be recorded as milestones of that single recommendation, not three separate successful recommendations.
7. **Buy-Above Trigger Logic**: A recommendation structured as "BUY ABOVE X" where the market price never reaches X is an **Untriggered Recommendation**. It must NEVER be counted as a trading loss.

---

## SECTION H: USER INTERFACE (UI/UX) DISCIPLINE

1. **Adhere to `design.md`**: All Android Composables and UI layouts must strictly follow the tokens, color palettes, spacing grids, and component patterns defined in `design.md`.
2. **No Random UI Patterns**: Do not introduce ad-hoc color codes, custom fonts, or novel navigation structures that deviate from the design system.
3. **Consistent Navigation Hierarchy**: Maintain standard backstack behavior and top-level destination routing.
4. **Accessibility Standards**: Interactive components must maintain at least a **48dp x 48dp** touch target. Every icon and image must provide a clear, non-null `contentDescription` unless purely decorative.
5. **Clear Distinction of Placeholder vs. Real Data**: Sandbox previews, mock states, and local test credentials must be clearly labeled (e.g., "SANDBOX MODE", "BETA") to prevent confusing users with real production data.

---

## SECTION I: TESTING & VERIFICATION DISCIPLINE

1. **Targeted Scope Testing**: During a specific feature task, run tests relevant to that feature. Do not execute exhaustive multi-minute full-project audits on every routine code change.
2. **Full Verification at Milestones**: Comprehensive end-to-end test execution across the entire platform will be conducted at formal project completion milestones.
3. **Targeted Failure Investigation**: If a test fails, diagnose and fix the specific root cause in the active task. Do not rewrite surrounding suites.
4. **NEVER Hide Failing Tests**: Do not delete failing assertions, comment out broken test cases, or add dummy pass statements (`assertTrue(true)`). Fix the underlying bug.

---

## SECTION J: CHANGE REPORTING PROTOCOL

At the conclusion of every development task, the developer or AI agent must provide a structured summary report containing:
* **Files Created**: List of all newly created files with their full paths.
* **Files Modified**: List of all existing files modified during the task.
* **Files Deleted**: Explicit list of any deleted files (should be "None" under standard rules).
* **Database Changes**: Any new migrations, altered tables, or seed changes.
* **API Changes**: Any new routes, altered request/response payloads, or deprecations.
* **Tests Run**: Commands executed and summary of passed/failed tests.
* **Build Result**: Compilation status across Android and Backend modules.
* **Unresolved Issues**: Any technical debt, edge cases, or pending questions discovered.

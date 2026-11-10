# Plan

Three stacked changes, each its own PR, on top of the timestamptz migration (#54):

1. **SQLite/D1 writes (#53)** — introduce `StoreDialect` (`metadata/store-dialect.ts`): `timestamp()`, `insertRow()`, `updateRowById()`, adapter-based detection. Stores stop calling `returningAll()` directly. Integration test with a small Kysely dialect over `node:sqlite`, skipped where the module is missing.
2. **bigint normalisation (#58)** — `mappers/number.ts`, applied to every size column.
3. **MySQL (#52)** — `0001_init.mysql.ts` as raw SQL (the schema builder cannot express collations, prefix indexes or table options portably); `"mysql"` branch in `StoreDialect` (UTC literal, write-then-select, driver probe); `locator-hash.ts`; MySQL compiler in the SQL generator; fixtures.

Verification harness (not in the repository): a script that drives `Migrator` + `KyselyMetadataStore` + `DefaultStorageService` with a fake `IStorage` against throwaway Docker containers, once writing in `Asia/Shanghai` and once reading in `America/New_York`.

Pitfalls:

- Kysely 0.29 exports `Migrator` from `kysely/migration`.
- Setting `TZ` in the environment does not change Node's zone when launched from Git Bash on Windows; set `process.env.TZ` inside the process or use PowerShell.
- `utf8mb4_bin` is a PAD SPACE collation: `'a' = 'a '`. Never compare object keys in SQL on MySQL; use the hash.
- MySQL 5.6: 767-byte per-column index limit; no generated columns (so the hash is computed in the store, not the database).
- `DEFAULT CURRENT_TIMESTAMP` on MySQL follows the session time zone — do not use it for UTC columns.

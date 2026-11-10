# Spec — time-zone-aware timestamp columns (migration 0002)

Issue: #48. Release target: 0.5.0 (breaking).

## Intent

`0001_init` created time columns as `timestamp`. On PostgreSQL that is a wall-clock value without a zone; the driver writes a `Date` as the local wall-clock time of the writing process and reads it back in the local zone of the reading process. Stored values therefore depend on a process setting, and cannot be compared with provider timestamps (`LastModified`). Every time column must hold an unambiguous instant, and existing data must be converted.

Consumers: applications already on 0.4.x that must run the migration against live data, and projects that copy the generated SQL into their own migration history and need it to stay fixed.

## Contract

```typescript
type DatabaseType = "postgres" | "mysql" | "sqlite";

interface MigrationOptions {
  /** PostgreSQL only. Zone the existing values were written in. Default "UTC". */
  readonly timestampSourceTimeZone?: string | undefined;
}

function createMigrations(dbType: DatabaseType, options?: MigrationOptions): Record<string, Migration>;
function createMigrationProvider(dbType: DatabaseType, options?: MigrationOptions): MigrationProvider;
function generateMigrationSql(key: string, dbType: DatabaseType, options?: MigrationOptions): Promise<string>;
function generateAllMigrationSql(dbType: DatabaseType, options?: MigrationOptions): Promise<Record<string, string>>;
```

Migration keys, in order: `0001_init`, `0002_timestamptz`.

`0002_timestamptz` covers the 14 time columns created by 0001 (`upload_sessions`: `created_at`, `updated_at`, `expires_at`, `completed_at`, `aborted_at`; `uploaded_parts.uploaded_at`; `blobs`: `created_at`, `updated_at`, `deleted_at`; `blob_references.created_at`; `files`: `created_at`, `updated_at`, `deleted_at`; `file_versions.created_at`).

| Database type | `up` | `down` |
|---|---|---|
| `postgres` | One `ALTER TABLE` per table: each column `TYPE timestamptz USING col AT TIME ZONE '<zone>'`. Columns with `DEFAULT CURRENT_TIMESTAMP` keep that default and `NOT NULL`. | Same with `TYPE timestamp`; with the same zone the original wall-clock values are restored exactly. |
| `mysql` | No statement. | No statement. |
| `sqlite` | Per column: values matching `YYYY-MM-DD HH:MM:SS` exactly are rewritten to `YYYY-MM-DDTHH:MM:SS.000Z`. Other values untouched. Idempotent. No DDL. | No statement. |

Invariants and errors:

- `0001_init` is frozen. Its SQL for `postgres` and `sqlite` is byte-identical to 0.4.x. For `mysql` it uses the column types `postgres` used, compiled with MySQL quoting.
- `timestampSourceTimeZone` may contain only letters, digits and `_ + - / :`, at most 64 characters; otherwise `ValidationError` with `field: "timestampSourceTimeZone"`, thrown when the migrations are created, for every database type.
- `generateMigrationSql` with an unknown key throws `ValidationError` with `field: "migrationKey"` (was a plain `Error`).
- `generateMigrationSql` never returns an empty script: a migration with no statement for the database type yields `-- <key>: no statements required for <dbType>`.
- Row mappers read a zone-less text value (`YYYY-MM-DD[ T]HH:MM[:SS[.fff]]`) as UTC. Values with a zone designator and `Date` objects are unchanged.

## Definition of done

- Migration, options, dialect split, mapper change, tests, SQL fixtures for 0001 and 0002.
- `up` and `down` executed against a real PostgreSQL; `up` executed against SQLite.
- `docs/migrations.md` covers the upgrade procedure and the validation method (sample `blobs.created_at` vs object `LastModified`).

## Out of scope

- Making `KyselyMetadataStore` writes work on SQLite/D1 (`Date` binding) and on MySQL (`RETURNING`, index key length). Pre-existing; documented, not fixed here.
- SQL Server.

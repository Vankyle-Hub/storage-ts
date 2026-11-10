# Spec — MySQL support and dialect-aware Kysely stores

Issues: #52 (MySQL), #53 (SQLite/D1 writes), #58 (bigint on PostgreSQL). Release target: 0.5.0.

## Intent

The Kysely metadata store was documented for "any Kysely-compatible SQL database" but written against PostgreSQL only. Running it against real databases showed three separate failures: SQLite/D1 cannot bind the `Date` parameters the stores pass; MySQL can neither apply the schema nor run the stores' queries; and on PostgreSQL itself `bigint` values come back as strings. The store must behave the same on every database it claims to support, and time must be an instant everywhere, guaranteed by the application layer where the database has no zone-aware type.

## Contract

```typescript
type DatabaseType = "postgres" | "mysql" | "sqlite";

interface KyselyStoreOptions {
  /** Detected from the Kysely dialect when omitted. */
  readonly databaseType?: DatabaseType | undefined;
}

class KyselyMetadataStore {
  constructor(db: Kysely<StorageDatabase>, options?: KyselyStoreOptions);
  readonly databaseType: DatabaseType;
}
// KyselyUploadSessionStore / KyselyBlobStore / KyselyFileStore take the same second argument.
```

Detection: dialect adapter `instanceof SqliteAdapter` → `"sqlite"` (covers `SqliteDialect`, `D1Dialect`); `instanceof MysqlAdapter` → `"mysql"`; otherwise `"postgres"`. An explicit option wins.

Time values — how a `Date` is bound, and what the column holds:

| Database | Column | Bound value |
|---|---|---|
| `postgres` | `timestamptz` | the `Date` |
| `mysql` | `DATETIME(3)`, UTC | `"YYYY-MM-DD HH:MM:SS.mmm"` in UTC |
| `sqlite` | `text` | `"YYYY-MM-DDTHH:MM:SS.mmmZ"` |

Invariants:

- A `Date` written through the store reads back as the same instant, to the millisecond, regardless of the time zone of the writing or reading process, the database session, or the server.
- The stores never bind a `Date` object on SQLite or MySQL.
- MySQL: before its first query each store verifies that the driver returns `DATETIME` as UTC (a UTC `Date`, or text). If not, every store method rejects with `MetadataError`. A failed check is retried on the next call; a passed check is cached.
- Size fields (`expectedSize`, `size`) are JavaScript numbers on every database.
- Writes return the stored row: via `RETURNING` on PostgreSQL/SQLite, via select-by-id on MySQL. Updating a missing id throws Kysely's `NoResultError` on all three.

MySQL schema (`0001_init`, type `"mysql"`; frozen from 0.5.0), same tables and index names as the other databases except:

- All tables `ENGINE=InnoDB`, `utf8mb4` / `utf8mb4_bin`.
- Time columns `DATETIME(3) NOT NULL` / nullable, no defaults.
- `blobs.locator_hash CHAR(64) ASCII NOT NULL` = lowercase hex SHA-256 of `JSON.stringify([provider, bucket, objectKey])`; `UNIQUE KEY idx_blobs_locator (locator_hash)`. `findBlobByLocator` looks up by this hash.
- `idx_files_owner (owner_id(191))`.
- JSON payload columns `MEDIUMTEXT`.

Locator semantics are identical on all databases: unique per `(provider, bucket, objectKey)`, compared byte-exactly (case-sensitive, trailing spaces significant), for keys up to 1024 UTF-8 bytes.

Migrations: every database type has the same keys. `0002_timestamptz` on `"mysql"` runs no statement; `generateMigrationSql` returns `-- 0002_timestamptz: no statements required for mysql` for it.

## Definition of done

- Implementation and unit tests; SQLite integration tests in the repository (real engine via `node:sqlite`).
- The full service flow verified against real PostgreSQL 17 and 18, MySQL 5.6, 5.7 and 8, with writer and reader in different time zones.
- Documentation for MySQL setup, schema differences and time handling.

## Out of scope

- SQL Server.
- Mapping unique-constraint violations to `MetadataConflictError` (no adapter does this today).
- Bundling database drivers or a containerised integration suite in CI.

# @vankyle/storage-kysely

`IMetadataStore` implementation backed by [Kysely](https://kysely.dev/), supporting any Kysely-compatible SQL database.

## Supported databases

- PostgreSQL
- SQLite
- MySQL — migration type `"mysql"`; known gaps, see [docs/migrations.md](../../docs/migrations.md#databasetype)
- Cloudflare D1 (via `D1Dialect` from `@vankyle/storage-cloudflare`)

## Installation

```bash
pnpm add @vankyle/storage-kysely kysely @vankyle/storage-core @vankyle/storage-shared
```

Add your database driver (e.g. `pg`, `mysql2`, `better-sqlite3`) as needed.

## Usage

```typescript
import { KyselyMetadataStore } from "@vankyle/storage-kysely";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { StorageDatabase } from "@vankyle/storage-kysely";

const db = new Kysely<StorageDatabase>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});

const metadata = new KyselyMetadataStore(db);
```

Pass `metadata` to `DefaultStorageService`:

```typescript
import { DefaultStorageService } from "@vankyle/storage-core";

const service = new DefaultStorageService({ storage, metadata, bucket: "..." });
```

## Database schema

Six tables are created by the included migrations:

| Table | Description |
|---|---|
| `upload_sessions` | Upload session state |
| `uploaded_parts` | Completed multipart upload parts |
| `blobs` | Physical objects in object storage |
| `blob_references` | Tracks which entities reference a blob |
| `files` | User-facing logical files |
| `file_versions` | Immutable snapshots linking a file to a blob |

### Indexes

| Index | Columns | Type |
|---|---|---|
| `idx_upload_sessions_status` | `status` | Non-unique |
| `idx_uploaded_parts_session` | `(session_id, part_number)` | Unique |
| `idx_blobs_sha256` | `sha256` | Non-unique |
| `idx_blobs_locator` | `(provider, bucket, object_key)` | Unique |

## Running migrations

`@vankyle/storage-kysely` exports `createMigrationProvider(dbType, options?)` for the [Kysely `Migrator`](https://kysely.dev/docs/migrations). `dbType` is `"postgres"`, `"mysql"`, or `"sqlite"` (SQLite and D1):

```typescript
import { Migrator } from "kysely";
import { createMigrationProvider } from "@vankyle/storage-kysely";

const migrator = new Migrator({
  db,
  provider: createMigrationProvider("postgres"),
});

const { error, results } = await migrator.migrateToLatest();

for (const result of results ?? []) {
  console.log(`Migration "${result.migrationName}": ${result.status}`);
}

if (error) {
  throw error;
}
```

| Migration | What it does |
|---|---|
| `0001_init` | Creates the tables and indexes |
| `0002_timestamptz` | Makes every time column an unambiguous instant: `timestamptz` on PostgreSQL, ISO-8601 UTC text on SQLite/D1, no change on MySQL |

**Upgrading an existing PostgreSQL database from 0.4.x:** `0002_timestamptz` converts existing values and must be told which time zone they were written in (`createMigrationProvider("postgres", { timestampSourceTimeZone: "Asia/Shanghai" })`, default `"UTC"`). See [docs/migrations.md](../../docs/migrations.md#migration-0002--time-zone-aware-timestamps) for how to choose the value and how to verify the result.

Use `generateMigrationSql(key, dbType, options?)` / `generateAllMigrationSql(dbType, options?)` to get the SQL as text.

## TypeScript schema type

`StorageDatabase` is the typed Kysely database interface. Import it for type inference:

```typescript
import type { StorageDatabase } from "@vankyle/storage-kysely";

const db = new Kysely<StorageDatabase>({ ... });
```

## Cloudflare D1

Use the `D1Dialect` from `@vankyle/storage-cloudflare` to run `KyselyMetadataStore` on D1:

```typescript
import { D1Dialect } from "@vankyle/storage-cloudflare";
import { KyselyMetadataStore } from "@vankyle/storage-kysely";
import { Kysely } from "kysely";
import type { StorageDatabase } from "@vankyle/storage-kysely";

const db = new Kysely<StorageDatabase>({
  dialect: new D1Dialect({ database: env.DB }),
});

const metadata = new KyselyMetadataStore(db);
```

The SQL emitted by Kysely is SQLite-compatible, which D1 is based on. All six stores and the migration work without modification.

## JSON fields

Some columns store JSON as text (`metadata`, `providerSessionData`, `providerPartData`). Row mappers in this package handle serialization (`JSON.stringify`) and deserialization (`JSON.parse`) automatically. Application code always receives typed `JsonObject | undefined` values.

## SQLite date handling

SQLite has no date type; time columns are `text` and come back as strings. Row mappers convert them to `Date` objects. The canonical stored format is ISO-8601 UTC (`2026-01-31T08:00:00.000Z`); a value without a zone designator, such as the `CURRENT_TIMESTAMP` default's `2026-01-31 08:00:00`, is read as UTC.

SQLite drivers and D1 cannot bind a JavaScript `Date`, so `Date` parameters must be serialized to that format on the way in (for example with a Kysely plugin). See [docs/migrations.md](../../docs/migrations.md#timestamp-storage-on-sqlite-and-d1).

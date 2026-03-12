# @vankyle-hub/storage-kysely

`IMetadataStore` implementation backed by [Kysely](https://kysely.dev/), supporting any Kysely-compatible SQL database.

## Supported databases

- PostgreSQL
- MySQL
- SQL Server (MSSQL)
- SQLite
- Cloudflare D1 (via `D1Dialect` from `@vankyle-hub/storage-cloudflare`)

## Installation

```bash
pnpm add @vankyle-hub/storage-kysely kysely @vankyle-hub/storage-core @vankyle-hub/storage-shared
```

Add your database driver (e.g. `pg`, `mysql2`, `better-sqlite3`) as needed.

## Usage

```typescript
import { KyselyMetadataStore } from "@vankyle-hub/storage-kysely";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

const db = new Kysely<StorageDatabase>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});

const metadata = new KyselyMetadataStore(db);
```

Pass `metadata` to `DefaultStorageService`:

```typescript
import { DefaultStorageService } from "@vankyle-hub/storage-core";

const service = new DefaultStorageService({ storage, metadata, bucket: "..." });
```

## Database schema

Six tables are created by the included migration:

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

`@vankyle-hub/storage-kysely` exports a `migrations` object compatible with the [Kysely `Migrator`](https://kysely.dev/docs/migrations):

```typescript
import { Migrator } from "kysely";
import { migrations } from "@vankyle-hub/storage-kysely";

const migrator = new Migrator({
  db,
  provider: {
    getMigrations: async () => migrations,
  },
});

const { error, results } = await migrator.migrateToLatest();

for (const result of results ?? []) {
  console.log(`Migration "${result.migrationName}": ${result.status}`);
}

if (error) {
  throw error;
}
```

## TypeScript schema type

`StorageDatabase` is the typed Kysely database interface. Import it for type inference:

```typescript
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

const db = new Kysely<StorageDatabase>({ ... });
```

## Cloudflare D1

Use the `D1Dialect` from `@vankyle-hub/storage-cloudflare` to run `KyselyMetadataStore` on D1:

```typescript
import { D1Dialect } from "@vankyle-hub/storage-cloudflare";
import { KyselyMetadataStore } from "@vankyle-hub/storage-kysely";
import { Kysely } from "kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

const db = new Kysely<StorageDatabase>({
  dialect: new D1Dialect({ database: env.DB }),
});

const metadata = new KyselyMetadataStore(db);
```

The SQL emitted by Kysely is SQLite-compatible, which D1 is based on. All six stores and the migration work without modification.

## JSON fields

Some columns store JSON as text (`metadata`, `providerSessionData`, `providerPartData`). Row mappers in this package handle serialization (`JSON.stringify`) and deserialization (`JSON.parse`) automatically. Application code always receives typed `JsonObject | undefined` values.

## SQLite date handling

SQLite returns `DATE` / `DATETIME` columns as strings. Row mappers convert them to `Date` objects via an `ensureDate()` helper. This is handled transparently — application code always receives `Date` values.

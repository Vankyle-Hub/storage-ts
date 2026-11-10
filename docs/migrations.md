# Database Migrations

The `@vankyle/storage-kysely` package ships migration factories that produce database-type-correct DDL. This page explains why the distinction matters, how to run migrations programmatically, how to generate SQL scripts, and how to upgrade an existing database to time-zone-aware timestamps (migration `0002`).

## Table of Contents

- [Why database-type-aware migrations?](#why-database-type-aware-migrations)
- [DatabaseType](#databasetype)
- [Migration list](#migration-list)
- [Programmatic migration — PostgreSQL](#programmatic-migration--postgresql)
- [Programmatic migration — MySQL](#programmatic-migration--mysql)
- [Programmatic migration — SQLite](#programmatic-migration--sqlite)
- [Programmatic migration — Cloudflare D1](#programmatic-migration--cloudflare-d1)
- [Generating SQL scripts](#generating-sql-scripts)
- [Migration 0002 — time-zone-aware timestamps](#migration-0002--time-zone-aware-timestamps)
  - [What it does per database](#what-it-does-per-database)
  - [Choosing the source time zone (PostgreSQL)](#choosing-the-source-time-zone-postgresql)
  - [Upgrading an existing PostgreSQL database](#upgrading-an-existing-postgresql-database)
  - [Verifying the conversion](#verifying-the-conversion)
  - [Rolling back](#rolling-back)
- [Timestamp storage on SQLite and D1](#timestamp-storage-on-sqlite-and-d1)
- [Adding future migrations](#adding-future-migrations)

---

## Why database-type-aware migrations?

Kysely compiles schema builder calls to dialect-specific SQL, but the column type names you supply are passed through as-is. The same migration using PostgreSQL-idiomatic types (`varchar(n)`, `bigint`, `timestamp`) still executes on SQLite/D1 because SQLite assigns type affinity by keyword matching — but the results differ in ways that matter:

| Column | PostgreSQL | SQLite / D1 assigned affinity | Issue |
|---|---|---|---|
| `varchar(36)` | enforced max-length string | TEXT (length ignored) | Misleading DDL — the constraint silently disappears |
| `bigint` | 64-bit integer | INTEGER (works, but non-idiomatic) | — |
| `timestamp` | native timestamp | **NUMERIC** | Timestamps stored as ISO-8601 text get NUMERIC affinity, which can cause unexpected coercion |

Using `'sqlite'` produces `text` for all string/timestamp columns and `integer` for all integer columns, which is idiomatic and avoids the NUMERIC affinity issue.

---

## DatabaseType

```typescript
type DatabaseType = "postgres" | "mysql" | "sqlite";
```

| Value | Use for |
|---|---|
| `"postgres"` | PostgreSQL |
| `"mysql"` | MySQL |
| `"sqlite"` | SQLite, Cloudflare D1 |

> **Changed in 0.5.0.** `"mysql"` is new. Up to 0.4.x, MySQL was covered by `"postgres"`. The two had to be separated because they diverge from migration `0002` onwards: PostgreSQL gets `timestamptz`, which MySQL does not have. If you use MySQL, pass `"mysql"` everywhere you passed `"postgres"`. `0001_init` produces the same column types for `"mysql"` as it did under `"postgres"`, so an existing MySQL database needs no change for 0001.

SQL Server is not supported by the bundled migrations: `timestamp` is a row-version type there, and a table may have only one such column, so `0001_init` cannot be applied.

**Known MySQL limitation.** On MySQL 8 with the default `utf8mb4` character set, `0001_init` fails when creating the unique index `idx_blobs_locator` (`Specified key was too long; max key length is 3072 bytes`), and `KyselyMetadataStore` relies on `RETURNING`, which MySQL does not support. Both predate 0.5.0 and are not changed by it; treat MySQL support as incomplete until they are resolved.

---

## Migration list

| Key | Purpose |
|---|---|
| `0001_init` | Creates the six tables and their indexes. Frozen — never edited after release. |
| `0002_timestamptz` | Makes every time column an unambiguous instant. See [Migration 0002](#migration-0002--time-zone-aware-timestamps). |

Shipped migrations are frozen. The exact SQL of each one is pinned by fixtures in `packages/kysely/src/migrations/__fixtures__/` and checked by the test suite, so a project that copies the generated SQL into its own migration directory can rely on it never changing.

---

## Programmatic migration — PostgreSQL

```typescript
import { Kysely, Migrator, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { createMigrationProvider } from "@vankyle/storage-kysely";
import type { StorageDatabase } from "@vankyle/storage-kysely";

const db = new Kysely<StorageDatabase>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});

const migrator = new Migrator({
  db,
  provider: createMigrationProvider("postgres"),
});

const { error, results } = await migrator.migrateToLatest();
if (error) throw error;
```

For a **new** database this is all you need. For a database that already holds data written by 0.4.x or earlier, read [Upgrading an existing PostgreSQL database](#upgrading-an-existing-postgresql-database) first: `0002` needs to know which time zone the existing values were written in.

`createMigrationProvider` and `createMigrations` take an optional second argument:

```typescript
interface MigrationOptions {
  /** PostgreSQL only. Time zone of the existing `timestamp` values. Default "UTC". */
  timestampSourceTimeZone?: string;
}
```

---

## Programmatic migration — MySQL

```typescript
import { Kysely, Migrator, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import { createMigrationProvider } from "@vankyle/storage-kysely";

const db = new Kysely<StorageDatabase>({
  dialect: new MysqlDialect({ pool: createPool({ uri: process.env.DATABASE_URL }) }),
});

const migrator = new Migrator({
  db,
  provider: createMigrationProvider("mysql"),
});

await migrator.migrateToLatest();
```

See the known MySQL limitation under [DatabaseType](#databasetype).

---

## Programmatic migration — SQLite

```typescript
import { Kysely, Migrator, SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import { createMigrationProvider } from "@vankyle/storage-kysely";
import type { StorageDatabase } from "@vankyle/storage-kysely";

const db = new Kysely<StorageDatabase>({
  dialect: new SqliteDialect({
    database: new Database("storage.db"),
  }),
});

const migrator = new Migrator({
  db,
  provider: createMigrationProvider("sqlite"),
});

await migrator.migrateToLatest();
```

---

## Programmatic migration — Cloudflare D1

Run migrations inside a Worker (e.g. on a `fetch` with an admin route, or in a Durable Object) or from a Node.js setup script using the D1 REST API client.

```typescript
// worker.ts
import { Kysely, Migrator } from "kysely";
import { D1Dialect } from "@vankyle/storage-cloudflare";
import { createMigrationProvider } from "@vankyle/storage-kysely";
import type { StorageDatabase } from "@vankyle/storage-kysely";

interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/admin/migrate" && request.method === "POST") {
      const db = new Kysely<StorageDatabase>({
        dialect: new D1Dialect(env.DB),
      });

      const migrator = new Migrator({
        db,
        provider: createMigrationProvider("sqlite"),
      });

      const { error, results } = await migrator.migrateToLatest();
      if (error) return new Response(String(error), { status: 500 });

      return Response.json({ results });
    }

    // ... rest of worker
  },
};
```

> **Note:** D1 does not support traditional transactions. The `D1Dialect` stubs transaction methods, so each migration statement runs independently. Every statement of `0002_timestamptz` on SQLite is safe to run more than once, so a partially applied run can simply be repeated.

---

## Generating SQL scripts

`generateMigrationSql(key, dbType, options?)` and `generateAllMigrationSql(dbType, options?)` return the `up` SQL of a migration as a plain string. Use them to produce files for `wrangler d1 migrations apply`, or to hand the SQL to a migration tool of your own.

```typescript
// scripts/generate-d1-migrations.ts
import { generateAllMigrationSql } from "@vankyle/storage-kysely";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("migrations", { recursive: true });

const migrations = await generateAllMigrationSql("sqlite");
for (const [key, sql] of Object.entries(migrations)) {
  writeFileSync(`migrations/${key}.sql`, sql);
  console.log(`wrote migrations/${key}.sql`);
}
```

Run this script as part of your build:

```bash
npx tsx scripts/generate-d1-migrations.ts
wrangler d1 migrations apply my-db
```

You can also generate a single migration, and pass the same options as to `createMigrations`:

```typescript
import { generateMigrationSql } from "@vankyle/storage-kysely";

const init = await generateMigrationSql("0001_init", "sqlite");

// PostgreSQL: the source time zone is baked into the generated SQL.
const timestamptz = await generateMigrationSql("0002_timestamptz", "postgres", {
  timestampSourceTimeZone: "Asia/Shanghai",
});
```

An unknown key throws `ValidationError` (`field: "migrationKey"`). A migration that runs no statement for a database type returns a one-line SQL comment rather than an empty string.

### Example output — `0001_init.sql`

```sql
create table "upload_sessions" ("id" text primary key, "provider" text not null, ...);

create index "idx_upload_sessions_status" on "upload_sessions" ("status");

create table "uploaded_parts" ("id" text primary key, ...);

-- ... (one statement per table and index)
```

### Example output — `0002_timestamptz.sql` (PostgreSQL, source zone `Asia/Shanghai`)

```sql
alter table "blobs"
  alter column "created_at" drop default,
  alter column "created_at" type timestamptz using "created_at" at time zone 'Asia/Shanghai',
  alter column "created_at" set default CURRENT_TIMESTAMP,
  -- ... updated_at likewise ...
  alter column "deleted_at" type timestamptz using "deleted_at" at time zone 'Asia/Shanghai';

-- ... one ALTER TABLE per table (six in total)
```

(The generated statement is on one line; it is wrapped here for reading.)

---

## Migration 0002 — time-zone-aware timestamps

`0001_init` created every time column as `timestamp` — on PostgreSQL, a timestamp *without* time zone. Such a column stores a wall-clock reading and nothing else. The Node.js PostgreSQL driver writes a `Date` into it as the **local wall-clock time of the writing process**, and reads it back by interpreting the value in the local time zone of the *reading* process. As long as every process runs in the same zone this round-trips, but:

- a reader in a different time zone gets a different instant for the same row;
- changing a deployment's `TZ` shifts every existing value;
- the values cannot be compared with provider timestamps such as an object's `LastModified`.

`0002_timestamptz` converts the 14 time columns of the six tables to an unambiguous instant.

### What it does per database

| Database type | Schema change | Data change |
|---|---|---|
| `postgres` | `timestamp` → `timestamptz` on all 14 columns, one `ALTER TABLE` per table. `DEFAULT CURRENT_TIMESTAMP` is preserved. | Each value is reinterpreted with `AT TIME ZONE <timestampSourceTimeZone>` (default `'UTC'`). |
| `mysql` | None. MySQL has no `timestamptz`; its `TIMESTAMP` type already stores a UTC instant. | None. The migration is recorded as applied but runs no statement. |
| `sqlite` (incl. D1) | None. Columns stay `text`. | Values in SQLite's `CURRENT_TIMESTAMP` format (`2026-01-31 08:00:00`, which is UTC by definition) are rewritten to ISO-8601 UTC (`2026-01-31T08:00:00.000Z`). Values that already carry a zone are left untouched. |

On PostgreSQL the `ALTER TABLE` rewrites each table and holds an `ACCESS EXCLUSIVE` lock on it for the duration. Run it in a maintenance window if the tables are large.

### Choosing the source time zone (PostgreSQL)

`timestampSourceTimeZone` must be the time zone of **the application processes that wrote the rows** — the Node.js process zone (the `TZ` environment variable, or the host's zone if `TZ` is unset). It is *not* the database server's `timezone` setting.

| Deployment that wrote the data | Value |
|---|---|
| Containers / most cloud runtimes (no `TZ` set) | `"UTC"` (the default) |
| Processes started with `TZ=Asia/Shanghai`, or on a host in that zone | `"Asia/Shanghai"` |

To see what a running application uses:

```typescript
console.log(Intl.DateTimeFormat().resolvedOptions().timeZone, process.env.TZ);
```

Prefer an IANA name (`"Asia/Shanghai"`, `"Europe/Berlin"`) over a fixed offset when the zone observes daylight saving time, so each value is converted with the offset that applied on its date. Wall-clock times inside a DST fall-back hour are inherently ambiguous; PostgreSQL resolves them to the standard-time reading.

If rows were written by processes in *different* zones, a single conversion cannot be correct for all of them. Convert with the zone of the majority, then correct the remainder with targeted `UPDATE`s identified by the [verification](#verifying-the-conversion) below.

The value is validated when the migrations are created: anything other than letters, digits and `_ + - / :` throws `ValidationError` (`field: "timestampSourceTimeZone"`).

### Upgrading an existing PostgreSQL database

1. **Determine the source time zone** as described above.
2. **Back up the database**, or at least the six tables.
3. **Stop writers** (or accept a short write outage — the tables are locked during the rewrite).
4. **Run the migration with the option set:**

   ```typescript
   const migrator = new Migrator({
     db,
     provider: createMigrationProvider("postgres", {
       timestampSourceTimeZone: "Asia/Shanghai", // omit for UTC
     }),
   });
   const { error, results } = await migrator.migrateToLatest();
   if (error) throw error;
   ```

   Or generate the SQL and apply it with your own tooling:

   ```typescript
   const sql = await generateMigrationSql("0002_timestamptz", "postgres", {
     timestampSourceTimeZone: "Asia/Shanghai",
   });
   ```

   If you apply generated SQL by hand, make sure it runs exactly once. Running it a second time on columns that are already `timestamptz` would shift the values.
5. **Verify** (next section) before letting writers back in.
6. **Deploy the application on 0.5.0.** No code change is needed for timestamps: with `timestamptz` columns the driver sends and receives true instants, independent of the process time zone.

The option only matters while `0002` is pending. Once it has run, the value passed to `createMigrationProvider` has no further effect.

### Verifying the conversion

A blob row is created when its upload is completed, moments after the object was written. So `blobs.created_at` should be **slightly later than** the object's `LastModified` in the storage provider — typically seconds, and no more than however long your clients take between upload and completion. A wrong source time zone shows up as a difference of a whole number of hours (or of 30/45 minutes for such zones).

1. Take a sample of rows, old and new:

   ```sql
   SELECT id, bucket, object_key, created_at
   FROM blobs
   WHERE status = 'active'
   ORDER BY random()
   LIMIT 20;
   ```

2. Compare each with the object's `LastModified`:

   ```typescript
   for (const row of sample) {
     const head = await storage.headObject({
       bucket: row.bucket,
       objectKey: row.object_key,
     });
     const diffSeconds =
       (row.created_at.getTime() - head.lastModified!.getTime()) / 1000;
     console.log(row.id, row.created_at.toISOString(),
       head.lastModified!.toISOString(), diffSeconds);
   }
   ```

   Or by hand: `aws s3api head-object --bucket <bucket> --key <object_key> --query LastModified`.

3. Read the result:

   | Difference (`created_at − LastModified`) | Meaning |
   |---|---|
   | Small and positive (seconds to minutes) | Correct. |
   | Close to a whole number of hours, the same for all rows | Wrong `timestampSourceTimeZone`. The difference is the error: e.g. `−8 h` means the data was written in UTC+8 but converted as UTC. |
   | Correct for some rows, off by whole hours for others | The rows were written by processes in different zones; see above. |

   Include rows from both sides of a daylight-saving change if the source zone has one.

4. Also confirm the column types:

   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_name IN ('upload_sessions','uploaded_parts','blobs','blob_references','files','file_versions')
     AND column_name LIKE '%\_at';
   -- every row: "timestamp with time zone"
   ```

If the check fails, [roll back](#rolling-back) and rerun with the right zone — or, since the error is a constant offset, correct it in place:

```sql
-- Example: converted as UTC, should have been Asia/Shanghai
UPDATE blobs SET created_at = (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai';
-- repeat for every time column of every table
```

### Rolling back

`migrator.migrateDown()` reverts `0002` on PostgreSQL by converting the columns back to `timestamp` with the same `AT TIME ZONE` — pass the **same** `timestampSourceTimeZone` you used for `up`, and the original wall-clock values are restored exactly. On MySQL and SQLite `down` does nothing (the SQLite ISO-8601 form is understood by every release).

---

## Timestamp storage on SQLite and D1

SQLite has no date type; the time columns are `text`. The rules are:

- **Canonical format:** ISO-8601 in UTC with a `Z` suffix and milliseconds — exactly what `Date.prototype.toISOString()` produces, e.g. `2026-01-31T08:00:00.000Z`. Values in this format sort correctly as text.
- **Reading:** the row mappers accept the canonical format, any ISO-8601 value with an explicit offset, and zone-less values (`2026-01-31 08:00:00`), which are read as **UTC**. (Before 0.5.0 a zone-less value was read in the process's local zone.)
- **Writing:** SQLite drivers and D1 cannot bind a JavaScript `Date`. `KyselyMetadataStore` passes `Date` values to Kysely, so on SQLite/D1 they must be serialized on the way in — for example with a Kysely plugin that converts `Date` parameters with `toISOString()`. Whatever does the conversion must produce the canonical format above.

Because the store cannot write a `Date` on SQLite without such a conversion, there is no legacy data in an ambiguous local-time format to migrate: existing values are either already ISO-8601 with a zone, or were produced by the column default `CURRENT_TIMESTAMP`, which SQLite defines as UTC. That is why `0002` on SQLite needs no source time zone and only normalizes the default's format.

---

## Adding future migrations

Each new migration is a factory function that follows the same pattern as the existing ones. Rules:

- **Never edit a shipped migration.** Add a new one. The SQL fixtures in `__fixtures__/` fail the test suite if a shipped migration changes.
- **Number sequentially.** The next free number is `0003`.
- **Create new time columns time-zone-aware from the start:** `timestamptz` on PostgreSQL, `timestamp` on MySQL, `text` (ISO-8601 UTC) on SQLite. Do not add them to `TIMESTAMP_COLUMNS_0001`; that list is frozen with `0001`.
- **Handle all three database types**, and update the Cosmos mapper when the domain model changes.
- **Add SQL fixtures** for the new migration (one per database type).

```typescript
// packages/kysely/src/migrations/0003_add_tags.ts
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import type { DatabaseType } from "./types";
import { getColumnTypes } from "./types";

export function createMigration0003(dbType: DatabaseType): Migration {
  const t = getColumnTypes(dbType);
  return {
    async up(db: Kysely<unknown>): Promise<void> {
      await db.schema
        .createTable("file_tags")
        .addColumn("file_id", t.uuid, (col) => col.notNull())
        .addColumn("tag", t.varchar(128), (col) => col.notNull())
        .execute();
    },
    async down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable("file_tags").ifExists().execute();
    },
  };
}
```

Then register it:

```typescript
// packages/kysely/src/migrations/index.ts
export function createMigrations(
  dbType: DatabaseType,
  options?: MigrationOptions,
): Record<string, Migration> {
  return {
    "0001_init": createMigration0001(dbType),
    "0002_timestamptz": createMigration0002(dbType, options),
    "0003_add_tags": createMigration0003(dbType),
  };
}
```

Kysely's `Migrator` uses the record keys as migration names and runs them in lexicographic order, tracking which have been applied in the `kysely_migration` table.

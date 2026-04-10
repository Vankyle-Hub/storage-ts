# Database Migrations

The `@vankyle-hub/storage-kysely` package ships migration factories that produce database-type-correct DDL. This page explains why the distinction matters, how to run migrations programmatically, and how to generate SQL scripts for Cloudflare D1.

## Table of Contents

- [Why database-type-aware migrations?](#why-database-type-aware-migrations)
- [DatabaseType](#databasetype)
- [Programmatic migration — PostgreSQL / MySQL](#programmatic-migration--postgresql--mysql)
- [Programmatic migration — SQLite](#programmatic-migration--sqlite)
- [Programmatic migration — Cloudflare D1](#programmatic-migration--cloudflare-d1)
- [Generating SQL scripts for wrangler](#generating-sql-scripts-for-wrangler)
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
type DatabaseType = "postgres" | "sqlite";
```

| Value | Use for |
|---|---|
| `"postgres"` | PostgreSQL, MySQL, SQL Server |
| `"sqlite"` | SQLite, Cloudflare D1 |

---

## Programmatic migration — PostgreSQL / MySQL

```typescript
import { Kysely, Migrator, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { createMigrationProvider } from "@vankyle-hub/storage-kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

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

For MySQL, swap `PostgresDialect` with `MysqlDialect` — the `"postgres"` type produces valid MySQL DDL as well.

---

## Programmatic migration — SQLite

```typescript
import { Kysely, Migrator, SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import { createMigrationProvider } from "@vankyle-hub/storage-kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

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
import { D1Dialect } from "@vankyle-hub/storage-cloudflare";
import { createMigrationProvider } from "@vankyle-hub/storage-kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

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

> **Note:** D1 does not support traditional transactions. The `D1Dialect` stubs transaction methods, so each migration statement runs independently.

---

## Generating SQL scripts for wrangler

`wrangler d1 migrations apply` reads `.sql` files from your project's `migrations/` directory. Use `generateAllMigrationSql` at build time to emit those files:

```typescript
// scripts/generate-d1-migrations.ts
import { generateAllMigrationSql } from "@vankyle-hub/storage-kysely";
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

You can also generate a single migration:

```typescript
import { generateMigrationSql } from "@vankyle-hub/storage-kysely";

const sql = await generateMigrationSql("0001_init", "sqlite");
```

### Example output — `0001_init.sql`

```sql
create table "upload_sessions" ("id" text primary key, "provider" text not null, ...);

create index "idx_upload_sessions_status" on "upload_sessions" ("status");

create table "uploaded_parts" ("id" text primary key, ...);

-- ... (one statement per table and index)
```

---

## Adding future migrations

Each new migration is a factory function that follows the same pattern as `createMigration0001`. Add it to the migrations registry in `index.ts`:

```typescript
// packages/kysely/src/migrations/0002_add_tags.ts
import type { Kysely, Migration } from "kysely";
import type { DatabaseType } from "./types";
import { getColumnTypes } from "./types";

export function createMigration0002(dbType: DatabaseType): Migration {
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
export function createMigrations(dbType: DatabaseType): Record<string, Migration> {
  return {
    "0001_init": createMigration0001(dbType),
    "0002_add_tags": createMigration0002(dbType),
  };
}
```

Kysely's `Migrator` uses the record keys as migration names and runs them in lexicographic order, tracking which have been applied in the `kysely_migration` table.

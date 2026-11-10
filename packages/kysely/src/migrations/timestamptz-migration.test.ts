import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  createMigrations,
  createMigrationProvider,
  generateMigrationSql,
  generateAllMigrationSql,
} from "@vankyle/storage-kysely";
import type { DatabaseType } from "@vankyle/storage-kysely";
import { ValidationError } from "@vankyle/storage-shared";

const DATABASE_TYPES: DatabaseType[] = ["postgres", "mysql", "sqlite"];

// 14 time columns were created by 0001 across the six tables.
const TIMESTAMP_COLUMN_COUNT = 14;

function fixture(name: string): string {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
  // Normalise line endings: git may check the fixtures out with CRLF.
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n").trimEnd();
}

describe("migration registry", () => {
  it.each(DATABASE_TYPES)("lists 0001 then 0002 for %s", (dbType) => {
    expect(Object.keys(createMigrations(dbType))).toEqual([
      "0001_init",
      "0002_timestamptz",
    ]);
  });

  it("exposes the same migrations through the provider", async () => {
    const migrations = await createMigrationProvider("postgres").getMigrations();
    expect(Object.keys(migrations)).toEqual(["0001_init", "0002_timestamptz"]);
  });
});

describe("frozen migration SQL", () => {
  // Shipped migrations must never change: databases that already ran them
  // would silently diverge from fresh installs. These fixtures are the
  // released SQL; a diff here means a shipped migration was edited.
  it.each(DATABASE_TYPES)("0001_init is unchanged for %s", async (dbType) => {
    expect(await generateMigrationSql("0001_init", dbType)).toBe(
      fixture(`0001_init.${dbType}.sql`),
    );
  });

  it.each(DATABASE_TYPES)("0002_timestamptz is unchanged for %s", async (dbType) => {
    expect(await generateMigrationSql("0002_timestamptz", dbType)).toBe(
      fixture(`0002_timestamptz.${dbType}.sql`),
    );
  });

  it("keeps 0001 on plain timestamp columns for postgres", async () => {
    const sql = await generateMigrationSql("0001_init", "postgres");
    expect(sql).toContain('"created_at" timestamp default CURRENT_TIMESTAMP not null');
    expect(sql).not.toContain("timestamptz");
  });

  it("gives mysql the column types it had under 'postgres', with mysql quoting", async () => {
    const mysql = await generateMigrationSql("0001_init", "mysql");
    const postgres = await generateMigrationSql("0001_init", "postgres");
    expect(mysql).toContain("`created_at` timestamp default CURRENT_TIMESTAMP not null");
    expect(mysql.replace(/`/g, '"')).toBe(postgres);
  });
});

describe("0002_timestamptz on postgres", () => {
  it("converts every time column to timestamptz, one ALTER TABLE per table", async () => {
    const sql = await generateMigrationSql("0002_timestamptz", "postgres");
    const statements = sql.split(";\n\n");

    expect(statements).toHaveLength(6);
    for (const statement of statements) {
      expect(statement).toMatch(/^alter table "/);
    }
    expect(sql.match(/type timestamptz using/g)).toHaveLength(TIMESTAMP_COLUMN_COUNT);
  });

  it("interprets existing values as UTC by default", async () => {
    const sql = await generateMigrationSql("0002_timestamptz", "postgres");
    expect(sql).toContain(
      `alter column "deleted_at" type timestamptz using "deleted_at" at time zone 'UTC'`,
    );
    expect(sql.match(/at time zone 'UTC'/g)).toHaveLength(TIMESTAMP_COLUMN_COUNT);
  });

  it("uses the configured source time zone", async () => {
    const sql = await generateMigrationSql("0002_timestamptz", "postgres", {
      timestampSourceTimeZone: "Asia/Shanghai",
    });
    expect(sql.match(/at time zone 'Asia\/Shanghai'/g)).toHaveLength(
      TIMESTAMP_COLUMN_COUNT,
    );
    expect(sql).not.toContain("'UTC'");
  });

  it("passes the option through generateAllMigrationSql", async () => {
    const all = await generateAllMigrationSql("postgres", {
      timestampSourceTimeZone: "+08:00",
    });
    expect(Object.keys(all)).toEqual(["0001_init", "0002_timestamptz"]);
    expect(all["0002_timestamptz"]).toContain("at time zone '+08:00'");
  });

  it("re-creates the CURRENT_TIMESTAMP default around the type change", async () => {
    const sql = await generateMigrationSql("0002_timestamptz", "postgres");
    expect(sql).toContain(
      `alter column "created_at" drop default, ` +
        `alter column "created_at" type timestamptz using "created_at" at time zone 'UTC', ` +
        `alter column "created_at" set default CURRENT_TIMESTAMP`,
    );
    // Nullable columns never had a default.
    expect(sql).not.toContain(`alter column "expires_at" drop default`);
  });

  it.each(["UTC'; drop table blobs; --", "", "Asia/Shang hai", "a".repeat(65)])(
    "rejects the time zone %j",
    (timestampSourceTimeZone) => {
      const build = () => createMigrations("postgres", { timestampSourceTimeZone });
      expect(build).toThrow(ValidationError);
      try {
        build();
      } catch (error) {
        expect((error as ValidationError).field).toBe("timestampSourceTimeZone");
      }
    },
  );

  it("validates the time zone for every database type", () => {
    for (const dbType of DATABASE_TYPES) {
      expect(() =>
        createMigrationProvider(dbType, { timestampSourceTimeZone: "no good" }),
      ).toThrow(ValidationError);
    }
  });
});

describe("0002_timestamptz on sqlite", () => {
  it("rewrites CURRENT_TIMESTAMP-format values to ISO-8601 UTC, column by column", async () => {
    const sql = await generateMigrationSql("0002_timestamptz", "sqlite");
    const statements = sql.split(";\n\n");

    expect(statements).toHaveLength(TIMESTAMP_COLUMN_COUNT);
    expect(statements[0]).toBe(
      `update "upload_sessions" set "created_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") ` +
        `where "created_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]'`,
    );
    // Column types are untouched: no DDL at all.
    expect(sql).not.toMatch(/alter table/i);
  });

  it("ignores the source time zone", async () => {
    const withZone = await generateMigrationSql("0002_timestamptz", "sqlite", {
      timestampSourceTimeZone: "Asia/Shanghai",
    });
    expect(withZone).toBe(await generateMigrationSql("0002_timestamptz", "sqlite"));
  });
});

describe("0002_timestamptz on mysql", () => {
  it("runs no statement and yields a non-empty script", async () => {
    expect(await generateMigrationSql("0002_timestamptz", "mysql")).toBe(
      "-- 0002_timestamptz: no statements required for mysql",
    );
  });
});

describe("generateMigrationSql", () => {
  it("throws a ValidationError for an unknown migration key", async () => {
    const error = await generateMigrationSql("9999_nope", "postgres").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe("migrationKey");
    expect((error as ValidationError).message).toContain("9999_nope");
  });
});

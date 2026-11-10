import { describe, expect, it } from "vitest";
import { generateMigrationSql, createMigrations } from "@/migrations/index";

describe("tag migrations", () => {
  it.each(["postgres", "mysql", "sqlite"] as const)(
    "should register the tags migration after 0002 for %s",
    (dbType) => {
      expect(Object.keys(createMigrations(dbType))).toEqual([
        "0001_init",
        "0002_timestamptz",
        "0003_add_tags",
      ]);
    },
  );

  it("should generate SQLite/D1-compatible tag DDL", async () => {
    const sql = await generateMigrationSql("0003_add_tags", "sqlite");

    expect(sql).toContain('create table "tags"');
    expect(sql).toContain('"normalized_name" text not null');
    expect(sql).toContain('create unique index "idx_tags_owner_name"');
    expect(sql).toContain('create table "file_tags"');
    expect(sql).toContain('"created_at" text default CURRENT_TIMESTAMP not null');
  });

  it("should generate Postgres-compatible tag DDL", async () => {
    const sql = await generateMigrationSql("0003_add_tags", "postgres");

    expect(sql).toContain('create table "tags"');
    expect(sql).toContain('"normalized_name" varchar(128) not null');
    expect(sql).toContain('create unique index "idx_file_tags_file_tag"');
  });

  it("should create time-zone-aware time columns on Postgres", async () => {
    const sql = await generateMigrationSql("0003_add_tags", "postgres");

    expect(sql.match(/timestamptz/g)).toHaveLength(3);
    expect(sql).not.toMatch(/" timestamp /);
  });

  it("should generate MySQL tag DDL with UTC datetime columns and no defaults", async () => {
    const sql = await generateMigrationSql("0003_add_tags", "mysql");

    expect(sql).toContain("create table tags (");
    expect(sql).toContain("create table file_tags (");
    expect(sql.match(/datetime\(3\) not null/g)).toHaveLength(3);
    expect(sql).not.toMatch(/current_timestamp/i);
    expect(sql).toContain("collate=utf8mb4_bin");
    expect(sql).toContain("unique key idx_file_tags_file_tag (file_id, tag_id)");
  });
});

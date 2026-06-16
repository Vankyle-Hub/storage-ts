import { describe, expect, it } from "vitest";
import { generateMigrationSql, createMigrations } from "@/migrations/index";

describe("tag migrations", () => {
  it("should register the tags migration", () => {
    expect(Object.keys(createMigrations("sqlite"))).toContain("0002_add_tags");
  });

  it("should generate SQLite/D1-compatible tag DDL", async () => {
    const sql = await generateMigrationSql("0002_add_tags", "sqlite");

    expect(sql).toContain('create table "tags"');
    expect(sql).toContain('"normalized_name" text not null');
    expect(sql).toContain('create unique index "idx_tags_owner_name"');
    expect(sql).toContain('create table "file_tags"');
  });

  it("should generate Postgres-compatible tag DDL", async () => {
    const sql = await generateMigrationSql("0002_add_tags", "postgres");

    expect(sql).toContain('create table "tags"');
    expect(sql).toContain('"normalized_name" varchar(128) not null');
    expect(sql).toContain('create unique index "idx_file_tags_file_tag"');
  });
});

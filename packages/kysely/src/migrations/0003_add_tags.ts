import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import { sql } from "kysely";
import type { ColumnDataType } from "kysely";
import type { DatabaseType } from "./types";
import { getColumnTypes } from "./types";

/**
 * Migration 0003 — user-scoped tags (`tags`, `file_tags`).
 *
 * Time columns are created time-zone-aware from the start, following the
 * rules introduced with 0002: `timestamptz` on PostgreSQL, ISO-8601 UTC text
 * on SQLite/D1, UTC `DATETIME(3)` without a default on MySQL. The shared
 * column-type map still says `timestamp` (it is frozen for 0001), so the
 * time type is chosen here.
 */
export function createMigration0003(dbType: DatabaseType): Migration {
  return {
    async up(db: Kysely<unknown>): Promise<void> {
      if (dbType === "mysql") {
        await createMysqlTagTables(db);
        return;
      }
      await createTagTables(db, dbType);
    },

    async down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable("file_tags").ifExists().execute();
      await db.schema.dropTable("tags").ifExists().execute();
    },
  };
}

async function createTagTables(
  db: Kysely<unknown>,
  dbType: Exclude<DatabaseType, "mysql">,
): Promise<void> {
  const t = getColumnTypes(dbType);
  const time: ColumnDataType = dbType === "postgres" ? "timestamptz" : "text";

  await db.schema
    .createTable("tags")
    .addColumn("id", t.uuid, (col) => col.primaryKey())
    .addColumn("owner_id", t.varchar(255), (col) => col.notNull())
    .addColumn("name", t.varchar(128), (col) => col.notNull())
    .addColumn("normalized_name", t.varchar(128), (col) => col.notNull())
    .addColumn("created_at", time, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", time, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("metadata", t.text)
    .execute();

  await db.schema
    .createIndex("idx_tags_owner")
    .on("tags")
    .column("owner_id")
    .execute();

  await db.schema
    .createIndex("idx_tags_owner_name")
    .on("tags")
    .columns(["owner_id", "normalized_name"])
    .unique()
    .execute();

  await db.schema
    .createTable("file_tags")
    .addColumn("file_id", t.uuid, (col) => col.notNull())
    .addColumn("tag_id", t.uuid, (col) => col.notNull())
    .addColumn("owner_id", t.varchar(255), (col) => col.notNull())
    .addColumn("created_at", time, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("idx_file_tags_file_tag")
    .on("file_tags")
    .columns(["file_id", "tag_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_file_tags_owner_tag")
    .on("file_tags")
    .columns(["owner_id", "tag_id"])
    .execute();

  await db.schema
    .createIndex("idx_file_tags_owner_file")
    .on("file_tags")
    .columns(["owner_id", "file_id"])
    .execute();
}

// MySQL follows the conventions of its 0001: utf8mb4_bin, UTC DATETIME(3)
// without defaults, MEDIUMTEXT payloads. owner_id is indexed by a
// 191-character prefix to fit MySQL 5.6's 767-byte per-column limit.
//
// TODO(#37): not yet run against a real MySQL server. Note that the prefix
// makes idx_tags_owner_name unique on (first 191 characters of owner_id,
// normalized_name); owners longer than that sharing a prefix would collide.
async function createMysqlTagTables(db: Kysely<unknown>): Promise<void> {
  const options = sql.raw(
    "engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin",
  );

  await sql`create table tags (
  id varchar(36) not null primary key,
  owner_id varchar(255) not null,
  name varchar(128) not null,
  normalized_name varchar(128) not null,
  created_at datetime(3) not null,
  updated_at datetime(3) not null,
  metadata mediumtext,
  key idx_tags_owner (owner_id(191)),
  unique key idx_tags_owner_name (owner_id(191), normalized_name)
) ${options}`.execute(db);

  await sql`create table file_tags (
  file_id varchar(36) not null,
  tag_id varchar(36) not null,
  owner_id varchar(255) not null,
  created_at datetime(3) not null,
  unique key idx_file_tags_file_tag (file_id, tag_id),
  key idx_file_tags_owner_tag (owner_id(191), tag_id),
  key idx_file_tags_owner_file (owner_id(191), file_id)
) ${options}`.execute(db);
}

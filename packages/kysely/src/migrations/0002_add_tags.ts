import type { Kysely, Migration } from "kysely";
import { sql } from "kysely";
import type { DatabaseType } from "./types";
import { getColumnTypes } from "./types";

export function createMigration0002(dbType: DatabaseType): Migration {
  const t = getColumnTypes(dbType);
  return {
    async up(db: Kysely<unknown>): Promise<void> {
      await db.schema
        .createTable("tags")
        .addColumn("id", t.uuid, (col) => col.primaryKey())
        .addColumn("owner_id", t.varchar(255), (col) => col.notNull())
        .addColumn("name", t.varchar(128), (col) => col.notNull())
        .addColumn("normalized_name", t.varchar(128), (col) => col.notNull())
        .addColumn("created_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("updated_at", t.timestamp, (col) =>
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
        .addColumn("created_at", t.timestamp, (col) =>
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
    },

    async down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable("file_tags").ifExists().execute();
      await db.schema.dropTable("tags").ifExists().execute();
    },
  };
}

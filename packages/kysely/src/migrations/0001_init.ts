import type { Kysely, Migration } from "kysely";
import { sql } from "kysely";
import type { DatabaseType } from "./types";
import { getColumnTypes } from "./types";

export function createMigration0001(dbType: DatabaseType): Migration {
  const t = getColumnTypes(dbType);
  return {
    async up(db: Kysely<unknown>): Promise<void> {
      await db.schema
        .createTable("upload_sessions")
        .addColumn("id", t.uuid, (col) => col.primaryKey())
        .addColumn("provider", t.varchar(32), (col) => col.notNull())
        .addColumn("bucket", t.varchar(255), (col) => col.notNull())
        .addColumn("object_key", t.varchar(1024), (col) => col.notNull())
        .addColumn("mode", t.varchar(16), (col) => col.notNull())
        .addColumn("status", t.varchar(16), (col) => col.notNull())
        .addColumn("file_name", t.varchar(512))
        .addColumn("mime_type", t.varchar(255))
        .addColumn("expected_size", t.bigint)
        .addColumn("expected_sha256", t.varchar(64))
        .addColumn("provider_upload_id", t.varchar(512))
        .addColumn("provider_session_data", t.text)
        .addColumn("created_by", t.varchar(255))
        .addColumn("owner_id", t.varchar(255))
        .addColumn("metadata", t.text)
        .addColumn("created_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("updated_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("expires_at", t.timestamp)
        .addColumn("completed_at", t.timestamp)
        .addColumn("aborted_at", t.timestamp)
        .execute();

      await db.schema
        .createIndex("idx_upload_sessions_status")
        .on("upload_sessions")
        .column("status")
        .execute();

      await db.schema
        .createTable("uploaded_parts")
        .addColumn("id", t.uuid, (col) => col.primaryKey())
        .addColumn("session_id", t.uuid, (col) => col.notNull())
        .addColumn("part_number", t.integer, (col) => col.notNull())
        .addColumn("size", t.bigint, (col) => col.notNull())
        .addColumn("etag", t.varchar(255))
        .addColumn("checksum_sha256", t.varchar(64))
        .addColumn("provider_part_id", t.varchar(512))
        .addColumn("provider_part_data", t.text)
        .addColumn("uploaded_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .execute();

      await db.schema
        .createIndex("idx_uploaded_parts_session")
        .on("uploaded_parts")
        .columns(["session_id", "part_number"])
        .unique()
        .execute();

      await db.schema
        .createTable("blobs")
        .addColumn("id", t.uuid, (col) => col.primaryKey())
        .addColumn("provider", t.varchar(32), (col) => col.notNull())
        .addColumn("bucket", t.varchar(255), (col) => col.notNull())
        .addColumn("object_key", t.varchar(1024), (col) => col.notNull())
        .addColumn("size", t.bigint, (col) => col.notNull())
        .addColumn("mime_type", t.varchar(255))
        .addColumn("sha256", t.varchar(64))
        .addColumn("etag", t.varchar(255))
        .addColumn("storage_class", t.varchar(32))
        .addColumn("status", t.varchar(16), (col) => col.notNull())
        .addColumn("created_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("updated_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("deleted_at", t.timestamp)
        .addColumn("metadata", t.text)
        .execute();

      await db.schema
        .createIndex("idx_blobs_sha256")
        .on("blobs")
        .column("sha256")
        .execute();

      await db.schema
        .createIndex("idx_blobs_locator")
        .on("blobs")
        .columns(["provider", "bucket", "object_key"])
        .unique()
        .execute();

      await db.schema
        .createTable("blob_references")
        .addColumn("id", t.uuid, (col) => col.primaryKey())
        .addColumn("blob_id", t.uuid, (col) => col.notNull())
        .addColumn("ref_type", t.varchar(64), (col) => col.notNull())
        .addColumn("ref_id", t.uuid, (col) => col.notNull())
        .addColumn("created_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .execute();

      await db.schema
        .createIndex("idx_blob_references_blob")
        .on("blob_references")
        .column("blob_id")
        .execute();

      await db.schema
        .createTable("files")
        .addColumn("id", t.uuid, (col) => col.primaryKey())
        .addColumn("owner_id", t.varchar(255))
        .addColumn("display_name", t.varchar(512), (col) => col.notNull())
        .addColumn("mime_type", t.varchar(255))
        .addColumn("current_version_id", t.uuid)
        .addColumn("size", t.bigint)
        .addColumn("parent_id", t.uuid)
        .addColumn("status", t.varchar(16), (col) => col.notNull())
        .addColumn("created_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("updated_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("deleted_at", t.timestamp)
        .addColumn("metadata", t.text)
        .execute();

      await db.schema
        .createIndex("idx_files_owner")
        .on("files")
        .column("owner_id")
        .execute();

      await db.schema
        .createIndex("idx_files_parent")
        .on("files")
        .column("parent_id")
        .execute();

      await db.schema
        .createTable("file_versions")
        .addColumn("id", t.uuid, (col) => col.primaryKey())
        .addColumn("file_id", t.uuid, (col) => col.notNull())
        .addColumn("blob_id", t.uuid, (col) => col.notNull())
        .addColumn("version", t.integer, (col) => col.notNull())
        .addColumn("size", t.bigint, (col) => col.notNull())
        .addColumn("mime_type", t.varchar(255))
        .addColumn("sha256", t.varchar(64))
        .addColumn("created_at", t.timestamp, (col) =>
          col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
        )
        .addColumn("created_by", t.varchar(255))
        .addColumn("metadata", t.text)
        .execute();

      await db.schema
        .createIndex("idx_file_versions_file")
        .on("file_versions")
        .columns(["file_id", "version"])
        .unique()
        .execute();
    },

    async down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable("file_versions").ifExists().execute();
      await db.schema.dropTable("files").ifExists().execute();
      await db.schema.dropTable("blob_references").ifExists().execute();
      await db.schema.dropTable("blobs").ifExists().execute();
      await db.schema.dropTable("uploaded_parts").ifExists().execute();
      await db.schema.dropTable("upload_sessions").ifExists().execute();
    },
  };
}

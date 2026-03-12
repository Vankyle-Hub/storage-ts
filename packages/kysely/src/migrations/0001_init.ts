import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("upload_sessions")
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("provider", "varchar(32)", (col) => col.notNull())
    .addColumn("bucket", "varchar(255)", (col) => col.notNull())
    .addColumn("object_key", "varchar(1024)", (col) => col.notNull())
    .addColumn("mode", "varchar(16)", (col) => col.notNull())
    .addColumn("status", "varchar(16)", (col) => col.notNull())
    .addColumn("file_name", "varchar(512)")
    .addColumn("mime_type", "varchar(255)")
    .addColumn("expected_size", "bigint")
    .addColumn("expected_sha256", "varchar(64)")
    .addColumn("provider_upload_id", "varchar(512)")
    .addColumn("provider_session_data", "text")
    .addColumn("created_by", "varchar(255)")
    .addColumn("owner_id", "varchar(255)")
    .addColumn("metadata", "text")
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("expires_at", "timestamp")
    .addColumn("completed_at", "timestamp")
    .addColumn("aborted_at", "timestamp")
    .execute();

  await db.schema
    .createIndex("idx_upload_sessions_status")
    .on("upload_sessions")
    .column("status")
    .execute();

  await db.schema
    .createTable("uploaded_parts")
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("session_id", "varchar(36)", (col) => col.notNull())
    .addColumn("part_number", "integer", (col) => col.notNull())
    .addColumn("size", "bigint", (col) => col.notNull())
    .addColumn("etag", "varchar(255)")
    .addColumn("checksum_sha256", "varchar(64)")
    .addColumn("provider_part_id", "varchar(512)")
    .addColumn("provider_part_data", "text")
    .addColumn("uploaded_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("idx_uploaded_parts_session")
    .on("uploaded_parts")
    .columns(["session_id", "part_number"])
    .unique()
    .execute();

  await db.schema
    .createTable("blobs")
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("provider", "varchar(32)", (col) => col.notNull())
    .addColumn("bucket", "varchar(255)", (col) => col.notNull())
    .addColumn("object_key", "varchar(1024)", (col) => col.notNull())
    .addColumn("size", "bigint", (col) => col.notNull())
    .addColumn("mime_type", "varchar(255)")
    .addColumn("sha256", "varchar(64)")
    .addColumn("etag", "varchar(255)")
    .addColumn("storage_class", "varchar(32)")
    .addColumn("status", "varchar(16)", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("deleted_at", "timestamp")
    .addColumn("metadata", "text")
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
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("blob_id", "varchar(36)", (col) => col.notNull())
    .addColumn("ref_type", "varchar(64)", (col) => col.notNull())
    .addColumn("ref_id", "varchar(36)", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("idx_blob_references_blob")
    .on("blob_references")
    .column("blob_id")
    .execute();

  await db.schema
    .createTable("files")
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("owner_id", "varchar(255)")
    .addColumn("display_name", "varchar(512)", (col) => col.notNull())
    .addColumn("mime_type", "varchar(255)")
    .addColumn("current_version_id", "varchar(36)")
    .addColumn("size", "bigint")
    .addColumn("parent_id", "varchar(36)")
    .addColumn("status", "varchar(16)", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("deleted_at", "timestamp")
    .addColumn("metadata", "text")
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
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("file_id", "varchar(36)", (col) => col.notNull())
    .addColumn("blob_id", "varchar(36)", (col) => col.notNull())
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("size", "bigint", (col) => col.notNull())
    .addColumn("mime_type", "varchar(255)")
    .addColumn("sha256", "varchar(64)")
    .addColumn("created_at", "timestamp", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("created_by", "varchar(255)")
    .addColumn("metadata", "text")
    .execute();

  await db.schema
    .createIndex("idx_file_versions_file")
    .on("file_versions")
    .columns(["file_id", "version"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("file_versions").ifExists().execute();
  await db.schema.dropTable("files").ifExists().execute();
  await db.schema.dropTable("blob_references").ifExists().execute();
  await db.schema.dropTable("blobs").ifExists().execute();
  await db.schema.dropTable("uploaded_parts").ifExists().execute();
  await db.schema.dropTable("upload_sessions").ifExists().execute();
}

import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import { sql } from "kysely";

// MySQL gets its own 0001 instead of the shared column-type map, because the
// shared schema cannot work there:
//
// - Character set and collation are pinned to utf8mb4 / utf8mb4_bin on every
//   table. Object keys, ids and status values are case-sensitive everywhere
//   else; MySQL's default collations are not.
// - Time columns are DATETIME(3) holding UTC, written by the stores as
//   literal UTC strings. TIMESTAMP is avoided: it converts through the
//   session time zone and ends in 2038. There is no DEFAULT CURRENT_TIMESTAMP,
//   because that would use the session time zone rather than UTC — the
//   stores always supply the value.
// - The unique locator constraint is on `locator_hash`, the SHA-256 (hex) of
//   (provider, bucket, object_key) computed by the store. An index over the
//   three columns themselves needs up to 5244 bytes with utf8mb4, above
//   InnoDB's limit (3072 bytes; 767 per column on MySQL 5.6). Hashing also
//   sidesteps PAD SPACE comparison, under which 'a' and 'a ' are equal.
// - `idx_files_owner` indexes a 191-character prefix, the longest utf8mb4
//   prefix that fits MySQL 5.6's 767-byte per-column limit.
// - JSON payloads use MEDIUMTEXT; TEXT would cap them at 64 KB.
const TABLE_OPTIONS = sql.raw(
  "engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin",
);

const ASCII_HASH = sql.raw("char(64) character set ascii collate ascii_bin");

const TABLES = [
  "file_versions",
  "files",
  "blob_references",
  "blobs",
  "uploaded_parts",
  "upload_sessions",
] as const;

/** Migration 0001 for MySQL (5.6.4+, 5.7, 8.x). */
export function createMysqlMigration0001(): Migration {
  return {
    async up(db: Kysely<unknown>): Promise<void> {
      await sql`create table upload_sessions (
  id varchar(36) not null primary key,
  provider varchar(32) not null,
  bucket varchar(255) not null,
  object_key varchar(1024) not null,
  mode varchar(16) not null,
  status varchar(16) not null,
  file_name varchar(512),
  mime_type varchar(255),
  expected_size bigint,
  expected_sha256 varchar(64),
  provider_upload_id varchar(512),
  provider_session_data mediumtext,
  created_by varchar(255),
  owner_id varchar(255),
  metadata mediumtext,
  created_at datetime(3) not null,
  updated_at datetime(3) not null,
  expires_at datetime(3),
  completed_at datetime(3),
  aborted_at datetime(3),
  key idx_upload_sessions_status (status)
) ${TABLE_OPTIONS}`.execute(db);

      await sql`create table uploaded_parts (
  id varchar(36) not null primary key,
  session_id varchar(36) not null,
  part_number integer not null,
  size bigint not null,
  etag varchar(255),
  checksum_sha256 varchar(64),
  provider_part_id varchar(512),
  provider_part_data mediumtext,
  uploaded_at datetime(3) not null,
  unique key idx_uploaded_parts_session (session_id, part_number)
) ${TABLE_OPTIONS}`.execute(db);

      await sql`create table blobs (
  id varchar(36) not null primary key,
  provider varchar(32) not null,
  bucket varchar(255) not null,
  object_key varchar(1024) not null,
  locator_hash ${ASCII_HASH} not null,
  size bigint not null,
  mime_type varchar(255),
  sha256 varchar(64),
  etag varchar(255),
  storage_class varchar(32),
  status varchar(16) not null,
  created_at datetime(3) not null,
  updated_at datetime(3) not null,
  deleted_at datetime(3),
  metadata mediumtext,
  key idx_blobs_sha256 (sha256),
  unique key idx_blobs_locator (locator_hash)
) ${TABLE_OPTIONS}`.execute(db);

      await sql`create table blob_references (
  id varchar(36) not null primary key,
  blob_id varchar(36) not null,
  ref_type varchar(64) not null,
  ref_id varchar(36) not null,
  created_at datetime(3) not null,
  key idx_blob_references_blob (blob_id)
) ${TABLE_OPTIONS}`.execute(db);

      await sql`create table files (
  id varchar(36) not null primary key,
  owner_id varchar(255),
  display_name varchar(512) not null,
  mime_type varchar(255),
  current_version_id varchar(36),
  size bigint,
  parent_id varchar(36),
  status varchar(16) not null,
  created_at datetime(3) not null,
  updated_at datetime(3) not null,
  deleted_at datetime(3),
  metadata mediumtext,
  key idx_files_owner (owner_id(191)),
  key idx_files_parent (parent_id)
) ${TABLE_OPTIONS}`.execute(db);

      await sql`create table file_versions (
  id varchar(36) not null primary key,
  file_id varchar(36) not null,
  blob_id varchar(36) not null,
  version integer not null,
  size bigint not null,
  mime_type varchar(255),
  sha256 varchar(64),
  created_at datetime(3) not null,
  created_by varchar(255),
  metadata mediumtext,
  unique key idx_file_versions_file (file_id, version)
) ${TABLE_OPTIONS}`.execute(db);
    },

    async down(db: Kysely<unknown>): Promise<void> {
      for (const table of TABLES) {
        await sql`drop table if exists ${sql.table(table)}`.execute(db);
      }
    },
  };
}

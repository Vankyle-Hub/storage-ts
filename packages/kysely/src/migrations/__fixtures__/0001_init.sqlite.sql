create table "upload_sessions" ("id" text primary key, "provider" text not null, "bucket" text not null, "object_key" text not null, "mode" text not null, "status" text not null, "file_name" text, "mime_type" text, "expected_size" integer, "expected_sha256" text, "provider_upload_id" text, "provider_session_data" text, "created_by" text, "owner_id" text, "metadata" text, "created_at" text default CURRENT_TIMESTAMP not null, "updated_at" text default CURRENT_TIMESTAMP not null, "expires_at" text, "completed_at" text, "aborted_at" text);

create index "idx_upload_sessions_status" on "upload_sessions" ("status");

create table "uploaded_parts" ("id" text primary key, "session_id" text not null, "part_number" integer not null, "size" integer not null, "etag" text, "checksum_sha256" text, "provider_part_id" text, "provider_part_data" text, "uploaded_at" text default CURRENT_TIMESTAMP not null);

create unique index "idx_uploaded_parts_session" on "uploaded_parts" ("session_id", "part_number");

create table "blobs" ("id" text primary key, "provider" text not null, "bucket" text not null, "object_key" text not null, "size" integer not null, "mime_type" text, "sha256" text, "etag" text, "storage_class" text, "status" text not null, "created_at" text default CURRENT_TIMESTAMP not null, "updated_at" text default CURRENT_TIMESTAMP not null, "deleted_at" text, "metadata" text);

create index "idx_blobs_sha256" on "blobs" ("sha256");

create unique index "idx_blobs_locator" on "blobs" ("provider", "bucket", "object_key");

create table "blob_references" ("id" text primary key, "blob_id" text not null, "ref_type" text not null, "ref_id" text not null, "created_at" text default CURRENT_TIMESTAMP not null);

create index "idx_blob_references_blob" on "blob_references" ("blob_id");

create table "files" ("id" text primary key, "owner_id" text, "display_name" text not null, "mime_type" text, "current_version_id" text, "size" integer, "parent_id" text, "status" text not null, "created_at" text default CURRENT_TIMESTAMP not null, "updated_at" text default CURRENT_TIMESTAMP not null, "deleted_at" text, "metadata" text);

create index "idx_files_owner" on "files" ("owner_id");

create index "idx_files_parent" on "files" ("parent_id");

create table "file_versions" ("id" text primary key, "file_id" text not null, "blob_id" text not null, "version" integer not null, "size" integer not null, "mime_type" text, "sha256" text, "created_at" text default CURRENT_TIMESTAMP not null, "created_by" text, "metadata" text);

create unique index "idx_file_versions_file" on "file_versions" ("file_id", "version");

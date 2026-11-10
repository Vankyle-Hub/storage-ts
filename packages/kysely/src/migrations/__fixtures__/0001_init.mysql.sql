create table `upload_sessions` (`id` varchar(36) primary key, `provider` varchar(32) not null, `bucket` varchar(255) not null, `object_key` varchar(1024) not null, `mode` varchar(16) not null, `status` varchar(16) not null, `file_name` varchar(512), `mime_type` varchar(255), `expected_size` bigint, `expected_sha256` varchar(64), `provider_upload_id` varchar(512), `provider_session_data` text, `created_by` varchar(255), `owner_id` varchar(255), `metadata` text, `created_at` timestamp default CURRENT_TIMESTAMP not null, `updated_at` timestamp default CURRENT_TIMESTAMP not null, `expires_at` timestamp, `completed_at` timestamp, `aborted_at` timestamp);

create index `idx_upload_sessions_status` on `upload_sessions` (`status`);

create table `uploaded_parts` (`id` varchar(36) primary key, `session_id` varchar(36) not null, `part_number` integer not null, `size` bigint not null, `etag` varchar(255), `checksum_sha256` varchar(64), `provider_part_id` varchar(512), `provider_part_data` text, `uploaded_at` timestamp default CURRENT_TIMESTAMP not null);

create unique index `idx_uploaded_parts_session` on `uploaded_parts` (`session_id`, `part_number`);

create table `blobs` (`id` varchar(36) primary key, `provider` varchar(32) not null, `bucket` varchar(255) not null, `object_key` varchar(1024) not null, `size` bigint not null, `mime_type` varchar(255), `sha256` varchar(64), `etag` varchar(255), `storage_class` varchar(32), `status` varchar(16) not null, `created_at` timestamp default CURRENT_TIMESTAMP not null, `updated_at` timestamp default CURRENT_TIMESTAMP not null, `deleted_at` timestamp, `metadata` text);

create index `idx_blobs_sha256` on `blobs` (`sha256`);

create unique index `idx_blobs_locator` on `blobs` (`provider`, `bucket`, `object_key`);

create table `blob_references` (`id` varchar(36) primary key, `blob_id` varchar(36) not null, `ref_type` varchar(64) not null, `ref_id` varchar(36) not null, `created_at` timestamp default CURRENT_TIMESTAMP not null);

create index `idx_blob_references_blob` on `blob_references` (`blob_id`);

create table `files` (`id` varchar(36) primary key, `owner_id` varchar(255), `display_name` varchar(512) not null, `mime_type` varchar(255), `current_version_id` varchar(36), `size` bigint, `parent_id` varchar(36), `status` varchar(16) not null, `created_at` timestamp default CURRENT_TIMESTAMP not null, `updated_at` timestamp default CURRENT_TIMESTAMP not null, `deleted_at` timestamp, `metadata` text);

create index `idx_files_owner` on `files` (`owner_id`);

create index `idx_files_parent` on `files` (`parent_id`);

create table `file_versions` (`id` varchar(36) primary key, `file_id` varchar(36) not null, `blob_id` varchar(36) not null, `version` integer not null, `size` bigint not null, `mime_type` varchar(255), `sha256` varchar(64), `created_at` timestamp default CURRENT_TIMESTAMP not null, `created_by` varchar(255), `metadata` text);

create unique index `idx_file_versions_file` on `file_versions` (`file_id`, `version`);

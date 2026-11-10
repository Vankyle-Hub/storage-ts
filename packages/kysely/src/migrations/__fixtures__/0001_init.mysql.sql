create table upload_sessions (
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
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin;

create table uploaded_parts (
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
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin;

create table blobs (
  id varchar(36) not null primary key,
  provider varchar(32) not null,
  bucket varchar(255) not null,
  object_key varchar(1024) not null,
  locator_hash char(64) character set ascii collate ascii_bin not null,
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
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin;

create table blob_references (
  id varchar(36) not null primary key,
  blob_id varchar(36) not null,
  ref_type varchar(64) not null,
  ref_id varchar(36) not null,
  created_at datetime(3) not null,
  key idx_blob_references_blob (blob_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin;

create table files (
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
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin;

create table file_versions (
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
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin;

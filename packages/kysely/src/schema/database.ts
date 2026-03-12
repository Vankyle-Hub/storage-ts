import type { Generated, ColumnType } from "kysely";

export interface UploadSessionsTable {
  id: string;
  provider: string;
  bucket: string;
  object_key: string;
  mode: string;
  status: string;
  file_name: string | null;
  mime_type: string | null;
  expected_size: number | null;
  expected_sha256: string | null;
  provider_upload_id: string | null;
  provider_session_data: string | null;
  created_by: string | null;
  owner_id: string | null;
  metadata: string | null;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
  expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  aborted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface UploadedPartsTable {
  id: string;
  session_id: string;
  part_number: number;
  size: number;
  etag: string | null;
  checksum_sha256: string | null;
  provider_part_id: string | null;
  provider_part_data: string | null;
  uploaded_at: ColumnType<Date, Date | string, Date | string>;
}

export interface BlobsTable {
  id: string;
  provider: string;
  bucket: string;
  object_key: string;
  size: number;
  mime_type: string | null;
  sha256: string | null;
  etag: string | null;
  storage_class: string | null;
  status: string;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  metadata: string | null;
}

export interface BlobReferencesTable {
  id: string;
  blob_id: string;
  ref_type: string;
  ref_id: string;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface FilesTable {
  id: string;
  owner_id: string | null;
  display_name: string;
  mime_type: string | null;
  current_version_id: string | null;
  size: number | null;
  parent_id: string | null;
  status: string;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  metadata: string | null;
}

export interface FileVersionsTable {
  id: string;
  file_id: string;
  blob_id: string;
  version: number;
  size: number;
  mime_type: string | null;
  sha256: string | null;
  created_at: ColumnType<Date, Date | string, Date | string>;
  created_by: string | null;
  metadata: string | null;
}

export interface StorageDatabase {
  upload_sessions: UploadSessionsTable;
  uploaded_parts: UploadedPartsTable;
  blobs: BlobsTable;
  blob_references: BlobReferencesTable;
  files: FilesTable;
  file_versions: FileVersionsTable;
}

alter table "upload_sessions" alter column "created_at" drop default, alter column "created_at" type timestamptz using "created_at" at time zone 'UTC', alter column "created_at" set default CURRENT_TIMESTAMP, alter column "updated_at" drop default, alter column "updated_at" type timestamptz using "updated_at" at time zone 'UTC', alter column "updated_at" set default CURRENT_TIMESTAMP, alter column "expires_at" type timestamptz using "expires_at" at time zone 'UTC', alter column "completed_at" type timestamptz using "completed_at" at time zone 'UTC', alter column "aborted_at" type timestamptz using "aborted_at" at time zone 'UTC';

alter table "uploaded_parts" alter column "uploaded_at" drop default, alter column "uploaded_at" type timestamptz using "uploaded_at" at time zone 'UTC', alter column "uploaded_at" set default CURRENT_TIMESTAMP;

alter table "blobs" alter column "created_at" drop default, alter column "created_at" type timestamptz using "created_at" at time zone 'UTC', alter column "created_at" set default CURRENT_TIMESTAMP, alter column "updated_at" drop default, alter column "updated_at" type timestamptz using "updated_at" at time zone 'UTC', alter column "updated_at" set default CURRENT_TIMESTAMP, alter column "deleted_at" type timestamptz using "deleted_at" at time zone 'UTC';

alter table "blob_references" alter column "created_at" drop default, alter column "created_at" type timestamptz using "created_at" at time zone 'UTC', alter column "created_at" set default CURRENT_TIMESTAMP;

alter table "files" alter column "created_at" drop default, alter column "created_at" type timestamptz using "created_at" at time zone 'UTC', alter column "created_at" set default CURRENT_TIMESTAMP, alter column "updated_at" drop default, alter column "updated_at" type timestamptz using "updated_at" at time zone 'UTC', alter column "updated_at" set default CURRENT_TIMESTAMP, alter column "deleted_at" type timestamptz using "deleted_at" at time zone 'UTC';

alter table "file_versions" alter column "created_at" drop default, alter column "created_at" type timestamptz using "created_at" at time zone 'UTC', alter column "created_at" set default CURRENT_TIMESTAMP;

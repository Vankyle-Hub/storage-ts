update "upload_sessions" set "created_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") where "created_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "upload_sessions" set "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") where "updated_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "upload_sessions" set "expires_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at") where "expires_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "upload_sessions" set "completed_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "completed_at") where "completed_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "upload_sessions" set "aborted_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "aborted_at") where "aborted_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "uploaded_parts" set "uploaded_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "uploaded_at") where "uploaded_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "blobs" set "created_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") where "created_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "blobs" set "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") where "updated_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "blobs" set "deleted_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "deleted_at") where "deleted_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "blob_references" set "created_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") where "created_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "files" set "created_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") where "created_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "files" set "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") where "updated_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "files" set "deleted_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "deleted_at") where "deleted_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

update "file_versions" set "created_at" = strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") where "created_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';

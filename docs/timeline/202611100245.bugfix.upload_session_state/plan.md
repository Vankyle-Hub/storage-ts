# Plan

1. `shared`: `UploadSessionStateError`, `UploadSessionExpiredError` in `errors/upload-error.ts`; export; class tests.
2. `core` service: one private guard (`assertWritable(session, operation)`) called after the mode check in `getUploadPartUrl`, `uploadPart`, `uploadObject`, `registerPart`, `completeUploadSession`; `abortUploadSession` handled on its own (idempotent on aborted, refused on completed). Cap the part URL lifetime at the session's remaining time. Service tests in `default-storage-service.session-state.test.ts`.
3. `core` port: doc-comment on `IUploadSessionStore.addPart` with the replace contract.
4. `kysely`: `addPart` as an upsert — `ON CONFLICT (session_id, part_number) DO UPDATE ... RETURNING` on PostgreSQL/SQLite, `ON DUPLICATE KEY UPDATE` + read back by `(session_id, part_number)` on MySQL (the row keeps its first id, so reading back by the new id would miss). `createBlob` maps unique violations to `MetadataConflictError`.
5. `azure`: Cosmos `addPart` upserts under a deterministic id (`<sessionId>:<partNumber>`). Documents written by earlier versions have random ids, so `listParts` / `getPart` also keep only the latest registration per part number.
6. Verify: unit tests, SQLite integration test, real PostgreSQL and MySQL in throwaway Docker containers.
7. Docs and changelog.

Pitfalls:

- Unique-violation detection is driver-specific: PostgreSQL `code === "23505"`, MySQL `errno === 1062` / `ER_DUP_ENTRY`, SQLite `SQLITE_CONSTRAINT_UNIQUE` or the message `UNIQUE constraint failed` (D1 only gives a message).
- On MySQL an upsert that changes nothing reports 0 affected rows; do not use the count to decide anything.

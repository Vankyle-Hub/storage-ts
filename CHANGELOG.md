# Changelog

## 0.6.1

### Security

- `@vankyle/storage-core` requires `zod` `^4.6.6` (was `^4.3.6`). Earlier
  4.x versions can exhaust memory while validating oversized constrained
  collections. Applications whose lockfile pins an older `zod` get the fix
  when they update. (#68)

No API change and no database migration. All packages are versioned
together, so every package is published as 0.6.1; only
`@vankyle/storage-core` differs from 0.6.0.

## 0.6.0

This release contains breaking changes. Read the upgrade notes before
updating from 0.5.0. There is no database migration.

### Breaking changes

- **Finished and expired upload sessions are refused.** `getUploadPartUrl`,
  `uploadPart`, `uploadObject`, `registerPart` and `completeUploadSession`
  throw `UploadSessionStateError` for a completed or aborted session and
  `UploadSessionExpiredError` once the session's `expiresAt` has passed.
  Before, only `uploadObject` checked the status and `expiresAt` was never
  enforced. (#61)
- **`uploadObject` on a completed or aborted session throws
  `UploadSessionStateError`** instead of `ValidationError`
  (`field: "status"`). (#61)
- **`abortUploadSession` on a completed session throws
  `UploadSessionStateError`** instead of relabelling the session as aborted.
  Aborting an already aborted session does nothing. (#61)
- **`IUploadSessionStore.addPart` must replace an existing part with the same
  part number.** Custom metadata stores need to implement this. (#62)
- **`createUploadSession` rejects an `expectedSize` that is not a
  non-negative integer** with `ValidationError` (`field: "expectedSize"`).
  (#63)

### Added

- `UploadSessionStateError` (`UPLOAD_SESSION_INVALID_STATE`; `sessionId`,
  `status`, `operation`) and `UploadSessionExpiredError`
  (`UPLOAD_SESSION_EXPIRED`; `sessionId`, `expiresAt`) in
  `@vankyle/storage-shared`. (#61)
- **Size-bound presigned upload URLs.** `CreatePutUrlInput` and
  `CreateUploadPartUrlInput` take an optional `contentLength`, and
  `GetUploadPartUrlRequest` takes an optional `contentLength` for the part.
  `S3Storage` signs it (`content-length` becomes a signed header), so S3
  rejects an upload of any other size with `403 SignatureDoesNotMatch`
  instead of storing it. For single-mode sessions `createUploadSession`
  passes `expectedSize` automatically. Providers that cannot enforce a size
  (Azure SAS) ignore it; `completeUploadSession` still verifies the size.
  (#63)
- `StorageCapabilities.signedContentLength` — `true` on `S3Storage`. (#63)

### Fixed

- Completing a session twice failed with a raw unique-index error from the
  database; it is now refused with `UploadSessionStateError` before anything
  is written. (#61)
- `KyselyBlobStore.createBlob` reports a blob locator that is already taken
  as `MetadataConflictError` instead of a raw driver error. (#61)
- Presigned part URLs from `getUploadPartUrl` no longer outlive their
  session: the lifetime is capped at the time the session has left. (#61)
- Registering or uploading the same part number again replaces the earlier
  part. The Kysely store failed on the `(session_id, part_number)` unique
  index; the Cosmos store silently kept both and passed duplicates to the
  provider on completion. (#62)

### Upgrade notes

1. **Error handling.** Calls on a completed, aborted or expired session now
   throw `UploadSessionStateError` or `UploadSessionExpiredError`. If you
   catch `ValidationError` with `field: "status"` from `uploadObject`,
   catch `UploadSessionStateError` instead. Decide what your application
   does when a session expires mid-upload: the client has to start a new
   session.
2. **`abortUploadSession`.** Do not call it to clean up a session that has
   already completed; it now throws.
3. **Custom `IUploadSessionStore`.** `addPart` must replace the part with the
   same `(sessionId, partNumber)` and `listParts` must return at most one
   part per part number. The Kysely and Cosmos stores already do.
4. **Cosmos DB.** No data change is needed. Parts written by 0.5.0 or earlier
   keep their random ids; duplicates for a part number are resolved on read
   to the most recent one.
5. **`expectedSize`.** Pass a non-negative integer. With `S3Storage` a
   single-mode presigned PUT URL now only accepts a body of exactly that
   size, so clients that declared one size and uploaded another get
   `403 SignatureDoesNotMatch` from the provider instead of an error at
   `completeUploadSession`.

### Verified against

PostgreSQL 18, MySQL 5.6, 5.7 and 8.4, and SQLite for the session rules and
part replacement; MinIO for size-bound presigned URLs.

### Known limitations

- Two concurrent `completeUploadSession` calls for one session are not
  serialized: the second fails with `MetadataConflictError` on the Kysely
  stores; `CosmosBlobStore` has no locator uniqueness.
- Size-bound presigned URLs were not verified against AWS S3 or Cloudflare
  R2 themselves, and the Cosmos store was verified with a fake container
  only.
- Azure SAS URLs cannot be bound to a size.

## 0.5.0

This release contains breaking changes. Read the upgrade notes before
updating from 0.4.x.

### Breaking changes

- **`IStorageService` has a new required method, `uploadObject`.** Custom
  implementations of the interface must add it. (#46)
- **`uploadPart` and `getUploadPartUrl` reject single-mode sessions with
  `ValidationError` (`field: "mode"`)** instead of `MetadataNotFoundError`.
  (#46)
- **MySQL uses the new `"mysql"` database type, and SQL Server is no longer
  listed as supported.** Both were documented under `"postgres"`, but the
  schema and the Kysely stores never worked there. Never pass `"postgres"`
  for a MySQL database. (#48, #52)
- **`createUploadSession` rejects object keys that are empty or longer than
  1024 UTF-8 bytes** with `ValidationError` (`field: "objectKey"`). (#56)
- **New migration `0002_timestamptz`.** `migrateToLatest()` now also converts
  the time columns: `timestamp` → `timestamptz` on PostgreSQL, with existing
  values converted using a source time zone you may need to supply. (#48)
- **Zone-less SQLite/D1 timestamp text is read as UTC**, not in the process's
  local time zone. (#48)
- **`generateMigrationSql` throws `ValidationError`** (`field:
  "migrationKey"`) for an unknown key instead of a plain `Error`. (#48)

### Added

- `IStorageService.uploadObject({ sessionId, body, contentLength? })` — a
  server-side write for single-mode upload sessions, backed by
  `IStorage.putObject`. The single-mode flow is `createUploadSession` →
  `uploadObject` → `completeUploadSession`, which makes single mode usable
  when the server already holds the bytes and with providers that cannot issue
  presigned PUT URLs (R2 binding). (#46)
- `UploadSizeMismatchError` (`UPLOAD_SIZE_MISMATCH`) and
  `UploadEtagMismatchError` (`UPLOAD_ETAG_MISMATCH`) in
  `@vankyle/storage-shared`, carrying `sessionId`, `expected` and `actual`.
  `completeUploadSession` throws them instead of plain `Error`s; the messages
  are unchanged. (#47)
- `MigrationOptions.timestampSourceTimeZone` (default `"UTC"`) for
  `createMigrations`, `createMigrationProvider`, `generateMigrationSql` and
  `generateAllMigrationSql`. (#48)
- `generateMigrationSql` / `generateAllMigrationSql` emit `0002_timestamptz`.
  (#48)
- **MySQL support** (5.6.4+, 5.7, 8.x) in `@vankyle/storage-kysely`: database
  type `"mysql"` with a schema of its own (`utf8mb4_bin`, UTC `DATETIME(3)`
  time columns, blob locator uniqueness through a hash column) and a store
  path that does not need `RETURNING`. The `mysql2` pool must be created with
  `timezone: "Z"` (or `dateStrings: true`); the stores check this and refuse
  to run otherwise. See
  [docs/migrations.md](docs/migrations.md#mysql-schema-and-time-handling).
  (#52)
- `KyselyMetadataStore` and the Kysely stores accept
  `KyselyStoreOptions { databaseType }`. The type is detected from the Kysely
  dialect when omitted. (#53)
- `assertValidObjectKey` and `MAX_OBJECT_KEY_BYTES` exported from
  `@vankyle/storage-core`. (#56)

### Fixed

- **SQLite / D1:** the Kysely stores bound `Date` parameters, which SQLite
  drivers and D1 reject, so writes failed unless the application serialized
  them. The stores now write ISO-8601 UTC text themselves. (#53)
- **PostgreSQL:** `bigint` columns reached the domain models as strings, and
  `completeUploadSession` failed its size check for a correct upload
  (`expected 3, got 3`) whenever the session had `expectedSize`. (#58)
- Documentation examples import `Migrator` from `kysely/migration`, as Kysely
  0.29 requires.
- `docs/getting-started.md` no longer says that R2 binding single-mode uploads
  are relayed through `uploadPart`, which never worked. (#46)

### Upgrade notes

1. **Code.** If you implement `IStorageService` yourself, add `uploadObject`.
   If you catch `MetadataNotFoundError` from `uploadPart` / `getUploadPartUrl`
   to detect single-mode sessions, catch `ValidationError` instead.
2. **PostgreSQL with existing data.** Before the first `migrateToLatest()` on
   0.5.0, decide which time zone the existing rows were written in — the time
   zone of the application processes, not of the database server — and pass it
   as `createMigrationProvider("postgres", { timestampSourceTimeZone })`. The
   default is `"UTC"`. The migration rewrites the six tables under an
   exclusive lock. Afterwards, verify by sampling `blobs.created_at` against
   the objects' `LastModified`. Full procedure:
   [docs/migrations.md](docs/migrations.md#migration-0002--time-zone-aware-timestamps).
3. **SQLite / D1.** Regenerate and apply the migration SQL; `0002` only
   normalizes the text format of existing values and needs no time zone. If
   you added a Kysely plugin to serialize `Date` parameters, it is no longer
   needed.
4. **Projects that keep their own copy of the migration SQL.** `0001_init` is
   unchanged. Generate `0002_timestamptz` with `generateMigrationSql`; for
   PostgreSQL the source time zone is baked into the SQL, and the SQL must be
   applied exactly once.

### Verified against

PostgreSQL 17 and 18, MySQL 5.6, 5.7 and 8.4, and SQLite, running the
migrations and the full upload flow with the writer and reader in different
time zones.

### Known limitations

- SQL Server is not supported.
- A real Cloudflare D1 database was not part of the verification; D1 is
  covered through SQLite.

## 0.4.1

- Removed the `node:crypto` dependency from `@vankyle/storage-core` ID
  generation. `generateId()` now uses the Web Crypto API via
  `globalThis.crypto.randomUUID()` with a `getRandomValues()` UUID v4 fallback.
- This fixes browser/Cloudflare Workers bundling for packages that depend on
  `@vankyle/storage-core`, including `@vankyle/storage-s3`, without requiring
  Node.js polyfills for this SDK code path.

## 0.4.0

- `getReadUrl` now accepts optional `responseContentDisposition` and
  `responseContentType`. When supplied, the S3 adapter bakes them into the
  presigned URL via S3's `response-content-disposition` /
  `response-content-type` query parameters, so the eventual GET response
  carries those headers without a backend proxy hop.
- Follow-up context for v2 backend handoff:
  `docs/refactors/v2/backend/route-completion/b2-storage/discussion.md`
  2026-05-24 (b) "Follow-up: vankyle upstream improvement".

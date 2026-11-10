# Spec — upload session state, expiry, and part re-registration

Issues: #61, #62.

## Intent

An upload session has a lifecycle (`pending` → `in-progress` → `completed` | `aborted`) and an `expiresAt`, but in 0.5.0 only `uploadObject` looked at either. A finished session could be written to and completed again (ending in a raw unique-index error from the database), an aborted session kept accepting parts, and expiry was decorative. Separately, a browser that retries one failed part and registers it again — a normal flow — hit the `(session_id, part_number)` unique index.

After this change every operation that writes to a session rejects a session that is finished or expired, with an error an API layer can map without string matching; and registering a part number again replaces the earlier registration.

## Contract

### New errors (`@vankyle/storage-shared`)

```typescript
/** The session is finished (completed or aborted) and no longer accepts the operation. */
class UploadSessionStateError extends BaseError {
  readonly code: "UPLOAD_SESSION_INVALID_STATE";
  readonly sessionId: string;
  /** The session's current status, e.g. "completed" or "aborted". */
  readonly status: string;
  /** The service operation that was refused, e.g. "registerPart". */
  readonly operation: string;
  constructor(sessionId: string, status: string, operation: string, options?: { cause?: unknown });
}

/** The session's `expiresAt` has passed. */
class UploadSessionExpiredError extends BaseError {
  readonly code: "UPLOAD_SESSION_EXPIRED";
  readonly sessionId: string;
  readonly expiresAt: Date;
  constructor(sessionId: string, expiresAt: Date, options?: { cause?: unknown });
}
```

`status` is a `string` because `shared` must not import the `core` enum.

### `DefaultStorageService`

| Operation | `completed` | `aborted` | open but expired |
|---|---|---|---|
| `getUploadPartUrl`, `uploadPart`, `uploadObject`, `registerPart`, `completeUploadSession` | `UploadSessionStateError` | `UploadSessionStateError` | `UploadSessionExpiredError` |
| `abortUploadSession` | `UploadSessionStateError` | resolves, does nothing | allowed (aborts) |

- **Expired** means `session.expiresAt !== undefined && session.expiresAt <= now`. A session without `expiresAt` never expires. Expiry is evaluated when the operation is called; it is not a stored status, and no schema changes.
- **Order of checks:** session exists (`MetadataNotFoundError`) → capability (`getUploadPartUrl` only) → mode (`ValidationError`, `field: "mode"`, unchanged) → status → expiry. A finished session whose `expiresAt` has also passed reports the state error.
- All of these checks run before any provider call and before any metadata write.
- `abortUploadSession` on an already aborted session is idempotent: no provider call, no metadata write. Aborting an expired open session is the way to clean it up, so it is allowed. Aborting a completed session is refused: the blob exists and the session must not be relabelled.
- `getUploadPartUrl` signs the URL for `min(defaultUploadExpiresInSeconds, whole seconds until session.expiresAt)`, at least 1 second, so a part URL does not outlive its session.

**Breaking:** `uploadObject` on a completed or aborted session used to throw `ValidationError` (`field: "status"`); it now throws `UploadSessionStateError` like the other operations.

### `IUploadSessionStore.addPart`

```typescript
/**
 * Records an uploaded part. If the session already has a part with the same
 * `partNumber`, the new registration replaces it: `size`, `etag`,
 * `checksumSha256`, `providerPartId`, `providerPartData` and `uploadedAt` are
 * overwritten (an omitted optional value clears the old one).
 *
 * Returns the part as stored. On replacement its `id` is the store's, and
 * need not equal `input.id`.
 */
addPart(input: CreateUploadedPartInput): Promise<UploadedPart>;
```

Invariant: `listParts(sessionId)` returns at most one part per `partNumber`, in ascending `partNumber` order. `getPart` returns the current registration.

Both `registerPart` and the server-proxied `uploadPart` go through `addPart`, so both gain replace semantics.

### `MetadataConflictError` from the Kysely blob store

`KyselyBlobStore.createBlob` throws `MetadataConflictError("Blob", "<provider>/<bucket>/<objectKey>")` (driver error as `cause`) when the blob locator is already taken, on PostgreSQL, MySQL and SQLite/D1. This is what two concurrent `completeUploadSession` calls that both pass the status check now end in, instead of a raw driver error.

## Definition of done

- Errors exported from `shared`; service guards and tests for every cell of the table above.
- `addPart` replace semantics in `KyselyUploadSessionStore` (PostgreSQL, MySQL, SQLite/D1) and `CosmosUploadSessionStore`, with tests; Kysely verified against real PostgreSQL and MySQL.
- `docs/architecture.md`, `docs/getting-started.md`, package READMEs and `CHANGELOG.md` updated.

## Out of scope

- Atomic status transitions (compare-and-set) and a retryable `completeUploadSession` after a partial metadata write. Two concurrent completes are still decided by the blob unique index, now with a typed error.
- A stored `expired` status or a sweeper for expired sessions.
- Mode check in `registerPart` (it accepts single-mode sessions today; unchanged).
- Size binding in presigned URLs (#63, separate PR).

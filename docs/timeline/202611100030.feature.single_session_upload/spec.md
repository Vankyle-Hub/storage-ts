# Spec — server-side write for single-mode upload sessions

Issue: #46. Release target: 0.5.0 (breaking).

## Intent

A server that already holds the bytes must be able to use a `single`-mode session. Before this change the only server-side write was `uploadPart`, which needs a provider multipart upload id and therefore always failed for single mode, and the service never called `IStorage.putObject`. Single mode was usable only through a client PUT to a presigned URL, which providers such as the R2 binding cannot issue.

Single-mode flow after this change: `createUploadSession` → `uploadObject` → `completeUploadSession`.

## Contract

```typescript
interface UploadObjectRequest {
  readonly sessionId: string;
  readonly body: Uint8Array | ReadableStream<Uint8Array>;
  readonly contentLength?: number | undefined;
}

interface UploadObjectResponse {
  readonly session: UploadSession;      // status is "in-progress"
  readonly etag?: string | undefined;   // provider ETag, if reported
}

interface IStorageService {
  uploadObject(request: UploadObjectRequest): Promise<UploadObjectResponse>;
}
```

Behavior of `DefaultStorageService.uploadObject`:

- Calls `IStorage.putObject` exactly once with the session's `bucket` and `objectKey`, the request `body`, `contentType = session.mimeType`, and `contentLength` resolved as: request value → `byteLength` of a `Uint8Array` body → `session.expectedSize` → `undefined`.
- The session's `expectedSha256` is **not** forwarded: adapters disagree on the checksum encoding (S3 expects base64, the column holds hex).
- After a successful write, a `pending` session becomes `in-progress`. No blob is created; `completeUploadSession` remains the only place that verifies the object and writes blob/file records.
- Repeatable before completion: a second call overwrites the object.
- If `putObject` rejects, the error propagates unchanged and the session is not modified.

Errors:

| Condition | Error |
|---|---|
| Session does not exist | `MetadataNotFoundError("UploadSession", id)` |
| Session mode is `multipart` | `ValidationError`, `field: "mode"` |
| Session status is `completed` or `aborted` | `ValidationError`, `field: "status"` |

Changed behavior of existing methods (breaking):

| Method | Single-mode session, before | After |
|---|---|---|
| `uploadPart` | `MetadataNotFoundError` | `ValidationError`, `field: "mode"` |
| `getUploadPartUrl` | `MetadataNotFoundError` | `ValidationError`, `field: "mode"` (after the capability check) |

A multipart session without a `providerUploadId` still yields `MetadataNotFoundError`.

## Definition of done

- `uploadObject` on `IStorageService` and `DefaultStorageService`, request/response types exported from `@vankyle/storage-core`.
- Unit tests for the flow, length resolution, and each error row.
- `docs/getting-started.md` no longer says R2-binding single mode goes through `uploadPart`; a usage section exists.

## Out of scope

- Typed size/ETag mismatch errors on complete (#47).
- Streaming checksum verification.

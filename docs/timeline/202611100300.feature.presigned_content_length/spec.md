# Spec — bind the expected size into presigned upload URLs

Issue: #63.

## Intent

A presigned upload URL lets a client write to object storage without going through the server. In 0.5.0 nothing in the URL limits how much the client may write: a session declared as 1 MB can receive 5 GB, and the server only finds out when `completeUploadSession` heads the object — after the bytes are stored and paid for.

Where the provider can enforce it, the declared size becomes part of the signature, so the provider itself rejects a body of any other size. The check at completion (`UploadSizeMismatchError`) stays: it is the only check for providers that cannot bind a size, and for sessions that declared none.

## Contract

### Storage port (`@vankyle/storage-core`)

```typescript
interface CreatePutUrlInput {
  // ...existing fields
  /**
   * Exact size of the request body in bytes. A provider that can bind it
   * into the signature (capabilities.signedContentLength) issues a URL that
   * only accepts a body of this size; other providers ignore it.
   */
  readonly contentLength?: number | undefined;
}

interface CreateUploadPartUrlInput {
  // ...existing fields
  /** Same as CreatePutUrlInput.contentLength, for one part. */
  readonly contentLength?: number | undefined;
}

interface StorageCapabilities {
  // ...existing fields
  /**
   * Presigned upload URLs enforce the `contentLength` they were created
   * with. Absent or false: `contentLength` is ignored and the size is only
   * verified by completeUploadSession.
   */
  readonly signedContentLength?: boolean | undefined;
}
```

Both new fields are optional; existing `IStorage` implementations keep compiling and keep their behavior.

| Provider | `signedContentLength` | Behavior |
|---|---|---|
| `S3Storage` | `true` | `content-length` is a signed header of the presigned URL. A request with a different `Content-Length` fails signature verification (HTTP 403). |
| `AzureBlobStorage` | absent | A SAS token cannot constrain the body size; `contentLength` is ignored. |
| `R2BindingStorage` | absent | No presigned URLs. |

### Service (`DefaultStorageService`)

```typescript
interface GetUploadPartUrlRequest {
  readonly sessionId: string;
  readonly partNumber: number;
  /**
   * Size in bytes of the part the client is about to upload. When given
   * and the provider supports it, the URL only accepts a body of exactly
   * this size.
   */
  readonly contentLength?: number | undefined;
}
```

- `createUploadSession`, single mode: `request.expectedSize` is passed to `createPutUrl` as `contentLength`. Without `expectedSize` the URL is unconstrained, as before.
- `getUploadPartUrl`: `request.contentLength` is passed to `createUploadPartUrl`. The service does not derive part sizes itself — only the caller knows how the file is split.
- Validation, before any provider call or metadata write:

| Condition | Error |
|---|---|
| `createUploadSession`: `expectedSize` given and not a non-negative safe integer | `ValidationError`, `field: "expectedSize"` |
| `getUploadPartUrl`: `contentLength` given and not a non-negative safe integer | `ValidationError`, `field: "contentLength"` |

Client side nothing changes: browsers and HTTP clients send `Content-Length` themselves. A client that sends the declared size succeeds; any other size is refused by the provider.

## Definition of done

- Port and service changes with tests; S3 tests assert that `content-length` is in `X-Amz-SignedHeaders` exactly when `contentLength` is given.
- End-to-end check against a real S3-compatible server: correct size accepted, wrong size refused, for both single PUT and a multipart part.
- Docs: `docs/architecture.md`, `docs/getting-started.md`, `packages/s3/README.md`, `CHANGELOG.md`.

## Out of scope

- Upper bounds rather than exact sizes (S3 presigned POST with `content-length-range`).
- Comparing the sum of registered part sizes with `expectedSize` before completing: recorded part sizes are client-declared (or `0` when a provider reports none), so the comparison can reject a correct upload. The head check after completion remains the authority.
- Signing `Content-Type` (see notes).

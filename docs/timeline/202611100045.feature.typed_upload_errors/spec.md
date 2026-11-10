# Spec — typed errors for upload size and ETag mismatches

Issue: #47. Release target: 0.5.0.

## Intent

`completeUploadSession` verified the stored object but reported a failed check as a plain `Error`. Callers could only match on the message and could not read the values. Every other service failure is a `BaseError` subclass with a stable `code`; these two now follow suit so an API layer can map them to a response without string matching.

## Contract

Exported from `@vankyle/storage-shared`:

```typescript
class UploadSizeMismatchError extends BaseError {
  readonly code: "UPLOAD_SIZE_MISMATCH";
  readonly sessionId: string;
  readonly expected: number;             // session.expectedSize
  readonly actual: number | undefined;   // provider-reported size, if any
  constructor(sessionId: string, expected: number, actual: number | undefined, options?: { cause?: unknown });
}

class UploadEtagMismatchError extends BaseError {
  readonly code: "UPLOAD_ETAG_MISMATCH";
  readonly sessionId: string;
  readonly expected: string;             // request.etag
  readonly actual: string | undefined;   // provider-reported ETag, if any
  constructor(sessionId: string, expected: string, actual: string | undefined, options?: { cause?: unknown });
}
```

`DefaultStorageService.completeUploadSession`:

| Condition | Error |
|---|---|
| `session.expectedSize !== undefined` and it differs from the stored object's size | `UploadSizeMismatchError` |
| `request.etag !== undefined` and it differs from the stored object's ETag (verbatim comparison, quotes included) | `UploadEtagMismatchError` |

Invariants:

- Size is checked before ETag.
- Both checks run before any metadata write (session update, blob, file, version, reference). After either error the session is unchanged and can be completed again or aborted.
- For multipart sessions the provider upload has already been completed when the checks run (unchanged from before).
- `message` is unchanged from the previous plain errors (`Uploaded size mismatch: expected X, got Y`, `Uploaded ETag mismatch: expected X, got Y`), so message-based handling keeps working.

## Definition of done

- Both classes exported from `shared`, used by the service, covered by tests.
- Error tables in `docs/architecture.md` and `packages/shared/README.md` updated; a handling example in `docs/getting-started.md`.
- Other plain `Error` throws in the service reviewed (see notes).

## Out of scope

Making `completeUploadSession` retryable after a partial metadata write — discussed in the PR, not implemented here.

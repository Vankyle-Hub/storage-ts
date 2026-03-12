# @vankyle-hub/storage-shared

Cross-package utilities, error types, and foundational TypeScript types for `vankyle-storage`.

This package has no internal dependencies and must not import from any other package in this monorepo.

## Contents

### Error types

All errors extend `BaseError`, which extends the native `Error` class and adds a `code: string` field and an optional `cause`.

| Class | Code | Extra fields |
|---|---|---|
| `BaseError` | (abstract) | `code`, `cause?` |
| `StorageError` | `STORAGE_ERROR` | — |
| `StorageObjectNotFoundError` | `STORAGE_OBJECT_NOT_FOUND` | `bucket`, `objectKey` |
| `CapabilityNotSupportedError` | `CAPABILITY_NOT_SUPPORTED` | `capability` |
| `MetadataError` | `METADATA_ERROR` | — |
| `MetadataNotFoundError` | `METADATA_NOT_FOUND` | `entityType`, `entityId` |
| `MetadataConflictError` | `METADATA_CONFLICT` | `entityType`, `entityId` |
| `ValidationError` | `VALIDATION_ERROR` | `field?` |

### `Result<T, E>`

A lightweight railway-oriented result type. No dependency on external libraries.

```typescript
import { ok, err, type Result } from "@vankyle-hub/storage-shared";

function divide(a: number, b: number): Result<number, Error> {
  if (b === 0) return err(new Error("division by zero"));
  return ok(a / b);
}

const result = divide(10, 2);
if (result.ok) {
  console.log(result.value); // 5
} else {
  console.error(result.error);
}
```

### TypeScript utility types

| Type | Description |
|---|---|
| `JsonValue` | `string \| number \| boolean \| null \| JsonObject \| JsonArray` |
| `JsonObject` | `{ [key: string]: JsonValue }` |
| `JsonArray` | `JsonValue[]` |
| `Maybe<T>` | `T \| undefined` |
| `PartialBy<T, K>` | Make keys `K` optional in `T` |
| `RequiredBy<T, K>` | Make keys `K` required in `T` |
| `Defined<T>` | Remove `undefined` from `T` |

### Utilities

```typescript
import { assert, assertNever } from "@vankyle-hub/storage-shared";
import { getRequiredEnv, getOptionalEnv } from "@vankyle-hub/storage-shared";

// Assertion (throws with message if falsy)
assert(user !== null, "user must exist");

// Exhaustive switch guard
switch (status) {
  case "active": ...
  case "deleted": ...
  default: assertNever(status); // compile error if a case is missing
}

// Environment variable helpers
const region = getRequiredEnv("AWS_REGION");          // throws if missing
const prefix = getOptionalEnv("KEY_PREFIX", "uploads"); // returns fallback if missing
```

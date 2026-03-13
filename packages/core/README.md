# @vankyle-hub/storage-core

Domain models, port interfaces, and the default application service for `vankyle-storage`.

This package has no dependency on any cloud SDK. It defines *what the system models* and *how it should behave*, leaving all infrastructure concerns to provider packages.

## What's in here

| Path | Content |
|---|---|
| `domain/models/` | `File`, `Blob`, `FileVersion`, `BlobReference`, `UploadSession`, `UploadedPart` |
| `domain/enums/` | `StorageProvider`, `UploadMode`, `UploadSessionStatus`, `BlobStatus`, `FileStatus` |
| `domain/value-objects/` | `SignedAccess`, `StorageLocator` |
| `schemas/` | Zod schemas for all six entities |
| `ports/storage/` | `IStorage`, `StorageCapabilities`, and all storage I/O types |
| `ports/metadata/` | `IMetadataStore`, `IUploadSessionStore`, `IBlobStore`, `IFileStore` |
| `ports/services/` | `IStorageService` |
| `application/services/` | `DefaultStorageService` |
| `application/policies/` | `IObjectKeyPolicy`, `DefaultObjectKeyPolicy` |
| `utils/` | `generateId()` |

## Dependencies

- `@vankyle-hub/storage-shared` — errors, `Result` type, utilities
- `zod` — schema validation

## Key interfaces

### `IStorage`

The abstraction for object storage operations. Required methods cover object CRUD and the full multipart upload lifecycle. Optional methods (`createReadUrl?`, `createPutUrl?`, `createUploadPartUrl?`) are gated by `capabilities`.

### `IMetadataStore`

Aggregates `IUploadSessionStore`, `IBlobStore`, and `IFileStore` under a single object.

### `IStorageService`

The public API for application code. Orchestrates uploads, manages blob and file records, and generates access URLs.

| Method | Description |
|---|---|
| `createUploadSession` | Starts a new upload session, optionally returning a presigned URL |
| `getUploadSession` | Retrieves an existing session by ID, including all fields saved at creation |
| `getUploadPartUrl` | Returns a presigned URL for a specific part (multipart, client-direct) |
| `uploadPart` | Proxies a part upload through the server |
| `registerPart` | Records a part that the client uploaded directly |
| `completeUploadSession` | Finalises the upload and creates blob + optional file records |
| `abortUploadSession` | Cancels the upload and cleans up the provider session |
| `getReadUrl` | Generates a presigned download URL for a file |
| `getFile` | Fetches a file record by ID |
| `getBlob` | Fetches a blob record by ID |
| `deleteFile` | Soft-deletes a file and marks orphaned blobs |

## `DefaultStorageService`

The reference implementation of `IStorageService`. Inject it with any `IStorage` + `IMetadataStore` combination.

```typescript
import { DefaultStorageService, UploadMode } from "@vankyle-hub/storage-core";

const service = new DefaultStorageService({
  storage,   // IStorage
  metadata,  // IMetadataStore
  bucket: "my-bucket",
  objectKeyPrefix: "uploads/",
  defaultUploadExpiresInSeconds: 3600,
  defaultReadUrlExpiresInSeconds: 900,
});
```

See the [Getting Started guide](../../docs/getting-started.md) for full usage examples.

## Object key policy

By default, `DefaultObjectKeyPolicy` generates keys as:

```
[prefix/][ownerId/]<uuid>[.ext]
```

Override by implementing `IObjectKeyPolicy`:

```typescript
import type { IObjectKeyPolicy, ObjectKeyPolicyInput } from "@vankyle-hub/storage-core";

class MyKeyPolicy implements IObjectKeyPolicy {
  generate(input: ObjectKeyPolicyInput): string {
    return `${input.ownerId ?? "anon"}/${Date.now()}-${input.fileName ?? "upload"}`;
  }
}

const service = new DefaultStorageService({
  ...,
  objectKeyPolicy: new MyKeyPolicy(),
});
```

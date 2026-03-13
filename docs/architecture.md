# Architecture

This document describes the design principles, package responsibilities, domain model, and interface contracts for `vankyle-storage`.

## Table of Contents

- [Design Principles](#design-principles)
- [Package Overview](#package-overview)
- [Dependency Rules](#dependency-rules)
- [Domain Model](#domain-model)
- [Port Interfaces](#port-interfaces)
- [Application Service Layer](#application-service-layer)
- [Provider Compatibility Strategy](#provider-compatibility-strategy)
- [Error Handling](#error-handling)
- [Capability Detection](#capability-detection)

---

## Design Principles

The system is built around four architectural ideas:

1. **Domain-first** — Entity definitions (`File`, `Blob`, `UploadSession`, etc.) live in `core` and depend on nothing but `zod` and `shared`. They describe *what the system models*, not how it stores anything.

2. **Ports and adapters (hexagonal architecture)** — Infrastructure concerns (object storage, SQL databases, Cosmos DB) are hidden behind interfaces defined in `core`. Provider packages implement those interfaces.

3. **Provider-packaged** — Each cloud ecosystem ships as a single, self-contained package. Azure storage and Azure Cosmos live in `azure`; Cloudflare R2 binding and D1 live in `cloudflare`. This matches how these services are actually deployed.

4. **Metadata–storage decoupled** — `IStorage` and `IMetadataStore` are independent ports. You can pair any object storage backend with any metadata backend (e.g. S3 + PostgreSQL, R2 Binding + D1, Azure Blob + Cosmos).

---

## Package Overview

### `packages/core` — `@vankyle-hub/storage-core`

The heart of the system. Contains:

- **Domain models** — `File`, `Blob`, `FileVersion`, `BlobReference`, `UploadSession`, `UploadedPart`
- **Domain enums** — `StorageProvider`, `UploadMode`, `UploadSessionStatus`, `BlobStatus`, `FileStatus`
- **Domain value objects** — `SignedAccess`, `StorageLocator`
- **Zod schemas** — one schema per entity, used for serialization and parse-time validation
- **Port interfaces** — `IStorage`, `IMetadataStore`, `IUploadSessionStore`, `IBlobStore`, `IFileStore`, `IStorageService`
- **Application service** — `DefaultStorageService` orchestrates the complete upload/download lifecycle
- **Policies** — `IObjectKeyPolicy`, `DefaultObjectKeyPolicy`

`core` has no dependency on any provider SDK. It only depends on `shared` and `zod`.

### `packages/shared` — `@vankyle-hub/storage-shared`

Cross-package infrastructure that is not specific to any domain concept:

- `BaseError`, `StorageError`, `MetadataError`, `ValidationError` and their subtypes
- `Result<T, E>` — railway-oriented result type (`ok` / `err`)
- JSON value types (`JsonValue`, `JsonObject`, etc.)
- Utility types (`Maybe<T>`, `PartialBy<T,K>`, `RequiredBy<T,K>`, `Defined<T>`)
- `assert`, `assertNever`
- `getRequiredEnv`, `getOptionalEnv`

`shared` must not import from `core` or any provider package.

### `packages/s3` — `@vankyle-hub/storage-s3`

`IStorage` implementation for any S3-compatible object storage:

- AWS S3
- Cloudflare R2 (S3 HTTP API)
- MinIO
- DigitalOcean Spaces
- Backblaze B2 (S3 compatible)
- Any backend that speaks the S3 signature protocol

Provides: multipart upload, presigned read/put/upload-part URLs.

### `packages/azure` — `@vankyle-hub/storage-azure`

`IStorage` and `IMetadataStore` implementations for the Azure ecosystem:

- **`AzureBlobStorage`** — `IStorage` backed by Azure Blob Storage with SAS token support. Simulates multipart upload via Azure Block Blob staging (`stageBlock` / `commitBlockList`).
- **`CosmosMetadataStore`** — `IMetadataStore` backed by Azure Cosmos DB. All entity types are stored in a single container, discriminated by a `type` field.

### `packages/cloudflare` — `@vankyle-hub/storage-cloudflare`

Adapters for the Cloudflare Workers runtime:

- **`R2BindingStorage`** — `IStorage` using the native R2 bucket binding API (`env.BUCKET`). Supports multipart upload via the native R2 multipart API. Cannot issue presigned URLs (Worker binding limitation).
- **`D1Dialect`** — Kysely `Dialect` implementation for Cloudflare D1, enabling `KyselyMetadataStore` to run on D1 without any code changes.

### `packages/kysely` — `@vankyle-hub/storage-kysely`

`IMetadataStore` implementation powered by [Kysely](https://kysely.dev/):

- Works with PostgreSQL, MySQL, SQL Server, SQLite, and Cloudflare D1 (via `D1Dialect`)
- Contains table schema types (`StorageDatabase`), row mappers, and Kysely query implementations for all six stores
- Includes migration `0001_init.ts` to create all tables and indexes

---

## Dependency Rules

```
shared
  ↑
core   (depends on: shared, zod)
  ↑
s3         (depends on: core, shared, @aws-sdk/*)
azure      (depends on: core, shared, @azure/*)
cloudflare (depends on: core, shared, kysely, @cloudflare/workers-types)
kysely     (depends on: core, shared, kysely)
```

**Forbidden dependencies:**

| Package | Must NOT depend on |
|---|---|
| `shared` | `core`, any provider package |
| `core` | `s3`, `azure`, `cloudflare`, `kysely` |
| `s3` | `azure`, `cloudflare`, `kysely` |
| `azure` | `s3`, `cloudflare`, `kysely` |
| `cloudflare` | `s3`, `azure` |
| `kysely` | `s3`, `azure`, `cloudflare` |

---

## Domain Model

### Entities

#### `UploadSession`

Represents an in-progress upload. Abstracts over S3 multipart upload, Azure block upload, and single PUT workflows.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `provider` | `StorageProvider` | |
| `bucket` | `string` | Bucket or container name |
| `objectKey` | `string` | Key/path within the bucket |
| `mode` | `UploadMode` | `single` or `multipart` |
| `status` | `UploadSessionStatus` | `pending` → `in-progress` → `completed` \| `aborted` |
| `fileName` | `string?` | Original file name |
| `mimeType` | `string?` | |
| `expectedSize` | `number?` | Client-declared size |
| `expectedSha256` | `string?` | Client-declared checksum |
| `providerUploadId` | `string?` | S3 multipart upload ID, etc. |
| `providerSessionData` | `JsonObject?` | Provider-specific metadata |
| `createdBy` | `string?` | User/identity that initiated the upload |
| `ownerId` | `string?` | Future owner of the file |
| `metadata` | `JsonObject?` | Application-defined metadata |
| `createdAt` / `updatedAt` | `Date` | |
| `expiresAt` / `completedAt` / `abortedAt` | `Date?` | Lifecycle timestamps |

#### `UploadedPart`

One completed chunk within a multipart upload session.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `sessionId` | `string` | FK → `UploadSession` |
| `partNumber` | `number` | 1-based |
| `size` | `number` | Bytes |
| `etag` | `string?` | Required for S3 completeMultipartUpload |
| `checksumSha256` | `string?` | |
| `providerPartId` | `string?` | |
| `providerPartData` | `JsonObject?` | |
| `uploadedAt` | `Date` | |

#### `Blob`

A physical object stored in an object storage backend. Not the same as a user-visible file — one blob can be referenced by multiple file versions.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `provider` | `StorageProvider` | |
| `bucket` | `string` | |
| `objectKey` | `string` | |
| `size` | `number` | |
| `mimeType` | `string?` | |
| `sha256` | `string?` | Content hash |
| `etag` | `string?` | Provider ETag |
| `storageClass` | `string?` | e.g. `STANDARD`, `INTELLIGENT_TIERING` |
| `status` | `BlobStatus` | `active` → `orphaned` → `pending-deletion` → `deleted` |
| `createdAt` / `updatedAt` | `Date` | |
| `deletedAt` | `Date?` | |
| `metadata` | `JsonObject?` | |

#### `File`

A user-facing logical file. Does not directly reference an object store key — that relationship goes through `FileVersion` → `Blob`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `ownerId` | `string?` | |
| `displayName` | `string` | User-visible name |
| `mimeType` | `string?` | |
| `currentVersionId` | `string?` | FK → `FileVersion` |
| `size` | `number?` | Denormalized from current version |
| `parentId` | `string?` | For folder-like hierarchies |
| `status` | `FileStatus` | `active` or `deleted` |
| `createdAt` / `updatedAt` | `Date` | |
| `deletedAt` | `Date?` | |
| `metadata` | `JsonObject?` | |

#### `FileVersion`

Immutable snapshot linking a `File` to a `Blob`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `fileId` | `string` | |
| `blobId` | `string` | |
| `version` | `number` | Monotonically increasing |
| `size` | `number` | |
| `mimeType` | `string?` | |
| `sha256` | `string?` | |
| `createdAt` | `Date` | |
| `createdBy` | `string?` | |
| `metadata` | `JsonObject?` | |

#### `BlobReference`

Tracks which entities reference a blob. Used for orphan detection and safe deletion.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `blobId` | `string` | |
| `refType` | `string` | e.g. `"file-version"` |
| `refId` | `string` | ID of the referencing entity |
| `createdAt` | `Date` | |

### Entity Relationships

```
File ──(currentVersionId)──► FileVersion ──(blobId)──► Blob
 │                                 │                       │
 │                           (fileId)               BlobReference
 └── one File has many FileVersions                  (blobId, refType, refId)
```

---

## Port Interfaces

### `IStorage`

The single abstraction for all object storage operations. Defined in `packages/core/src/ports/storage/i-storage.ts`.

```typescript
interface IStorage {
  readonly provider: StorageProvider;
  readonly capabilities: StorageCapabilities;

  // Core CRUD
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<void>;

  // Multipart upload lifecycle
  initUploadSession(input: InitUploadSessionInput): Promise<InitUploadSessionResult>;
  uploadPart(input: UploadPartInput): Promise<UploadPartResult>;
  completeUploadSession(input: CompleteUploadSessionInput): Promise<CompleteUploadSessionResult>;
  abortUploadSession(input: AbortUploadSessionInput): Promise<void>;

  // Signed / pre-authorized access (optional — check capabilities)
  createReadUrl?(input: CreateReadUrlInput): Promise<SignedAccess>;
  createPutUrl?(input: CreatePutUrlInput): Promise<SignedAccess>;
  createUploadPartUrl?(input: CreateUploadPartUrlInput): Promise<SignedAccess>;
}

interface StorageCapabilities {
  multipartUpload: boolean;
  signedReadUrl: boolean;
  signedPutUrl: boolean;
  signedPartUrl: boolean;
  serverSideCopy?: boolean;
}
```

### `IMetadataStore`

Aggregates three sub-stores. Defined in `packages/core/src/ports/metadata/`.

```typescript
interface IMetadataStore {
  uploads: IUploadSessionStore;
  blobs: IBlobStore;
  files: IFileStore;
}

interface IUploadSessionStore {
  createSession(input): Promise<UploadSession>;
  getSession(id): Promise<UploadSession | undefined>;
  updateSession(id, input): Promise<UploadSession>;
  addPart(input): Promise<UploadedPart>;
  getPart(sessionId, partNumber): Promise<UploadedPart | undefined>;
  listParts(sessionId): Promise<UploadedPart[]>;
}

interface IBlobStore {
  createBlob(input): Promise<Blob>;
  getBlob(id): Promise<Blob | undefined>;
  updateBlob(id, input): Promise<Blob>;
  findBlobBySha256(sha256): Promise<Blob | undefined>;
  findBlobByLocator(locator): Promise<Blob | undefined>;
  createReference(input): Promise<BlobReference>;
  listReferences(blobId): Promise<BlobReference[]>;
  deleteReference(id): Promise<void>;
}

interface IFileStore {
  createFile(input): Promise<File>;
  getFile(id): Promise<File | undefined>;
  updateFile(id, input): Promise<File>;
  createVersion(input): Promise<FileVersion>;
  getVersion(id): Promise<FileVersion | undefined>;
  listVersions(fileId): Promise<FileVersion[]>;
  getLatestVersion(fileId): Promise<FileVersion | undefined>;
}
```

### `IStorageService`

The public API for application code. Defined in `packages/core/src/ports/services/i-storage-service.ts`.

```typescript
interface IStorageService {
  createUploadSession(req): Promise<CreateUploadSessionResponse>;
  getUploadSession(sessionId): Promise<UploadSession | undefined>;
  getUploadPartUrl(req): Promise<SignedAccess>;
  uploadPart(req): Promise<UploadedPart>;        // server-proxied upload
  registerPart(req): Promise<UploadedPart>;      // client-direct upload confirmation
  completeUploadSession(req): Promise<CompleteUploadSessionResponse>;
  abortUploadSession(sessionId): Promise<void>;
  getReadUrl(req): Promise<SignedAccess>;
  getFile(fileId): Promise<File | undefined>;
  getBlob(blobId): Promise<Blob | undefined>;
  deleteFile(req): Promise<void>;
}
```

---

## Application Service Layer

`DefaultStorageService` in `packages/core/src/application/services/default-storage-service.ts` is the reference implementation of `IStorageService`.

### Constructor options

```typescript
interface DefaultStorageServiceOptions {
  storage: IStorage;
  metadata: IMetadataStore;
  bucket: string;
  objectKeyPolicy?: IObjectKeyPolicy;
  objectKeyPrefix?: string;
  defaultUploadExpiresInSeconds?: number;
  defaultReadUrlExpiresInSeconds?: number;
}
```

### Upload lifecycle

```
createUploadSession
  ├─ (multipart) initUploadSession → IStorage
  └─ (single)    createPutUrl?     → IStorage
         ↓
getUploadSession                               (optional — retrieve current state)
         ↓
getUploadPartUrl / uploadPart / registerPart   (zero or more)
         ↓
completeUploadSession
  ├─ (multipart) completeUploadSession → IStorage
  ├─ headObject                        → IStorage
  ├─ createBlob                        → IMetadataStore.blobs
  ├─ (if createFile) createFile + createVersion + createReference → IMetadataStore.files / blobs
  └─ updateSession (status = completed)
```

### Object key policy

`DefaultObjectKeyPolicy` generates deterministic object keys:

```
[prefix/][ownerId/]<uuid>[.ext]
```

Override by implementing `IObjectKeyPolicy` and passing it in `objectKeyPolicy`.

---

## Provider Compatibility Strategy

### Object Storage

| Scenario | Package |
|---|---|
| AWS S3 | `s3` |
| Cloudflare R2 via S3-compatible HTTP API | `s3` |
| MinIO, DigitalOcean Spaces, Backblaze B2 | `s3` |
| Cloudflare R2 via Worker Binding (`env.BUCKET`) | `cloudflare` |
| Azure Blob Storage | `azure` |

Use `cloudflare` only when you are running inside a Cloudflare Worker and have a direct `R2Bucket` binding. For everything else, prefer `s3`.

### Metadata Storage

| Scenario | Package |
|---|---|
| PostgreSQL, MySQL, SQL Server, SQLite | `kysely` |
| Cloudflare D1 | `kysely` + `D1Dialect` from `cloudflare` |
| Azure Cosmos DB | `azure` |

### Capability matrix

| Provider | multipart | signedReadUrl | signedPutUrl | signedPartUrl |
|---|---|---|---|---|
| `S3Storage` | ✓ | ✓ | ✓ | ✓ |
| `AzureBlobStorage` | ✓ (block staging) | ✓ | ✓ | ✗ |
| `R2BindingStorage` | ✓ | ✗ | ✗ | ✗ |

When `signedPutUrl` is `false` (e.g. R2 Binding), `createUploadSession` returns no `uploadUrl` for single-mode uploads. The client must upload through your server via `uploadPart`.

---

## Error Handling

All errors extend `BaseError` from `packages/shared`. Provider adapters are responsible for mapping SDK errors to these types before they surface to application code.

| Class | Code | When |
|---|---|---|
| `StorageError` | `STORAGE_ERROR` | Generic object storage failure |
| `StorageObjectNotFoundError` | `STORAGE_OBJECT_NOT_FOUND` | Object not found (`bucket`, `objectKey`) |
| `CapabilityNotSupportedError` | `CAPABILITY_NOT_SUPPORTED` | Calling an optional method when not supported |
| `MetadataError` | `METADATA_ERROR` | Generic metadata failure |
| `MetadataNotFoundError` | `METADATA_NOT_FOUND` | Entity not found (`entityType`, `entityId`) |
| `MetadataConflictError` | `METADATA_CONFLICT` | Uniqueness constraint violation |
| `ValidationError` | `VALIDATION_ERROR` | Schema or input validation failure |

---

## Capability Detection

`DefaultStorageService` inspects `storage.capabilities` at runtime to decide behavior — no `instanceof` checks needed:

```typescript
if (storage.capabilities.signedPutUrl && storage.createPutUrl) {
  uploadUrl = await storage.createPutUrl({ ... });
}
```

This makes `DefaultStorageService` compatible with any `IStorage` implementation without modification.

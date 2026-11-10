# Getting Started

This guide walks through the most common usage patterns. For the full design rationale, see [architecture.md](architecture.md).

## Table of Contents

- [Installation](#installation)
- [S3 + PostgreSQL (Kysely)](#s3--postgresql-kysely)
- [S3 + MySQL (Kysely)](#s3--mysql-kysely)
- [Azure Blob + Cosmos DB](#azure-blob--cosmos-db)
- [Cloudflare Worker: R2 Binding + D1](#cloudflare-worker-r2-binding--d1)
- [Upload patterns](#upload-patterns)
  - [Single file — client direct upload](#single-file--client-direct-upload)
  - [Single file — server-side upload](#single-file--server-side-upload)
  - [Multipart — client-direct parts](#multipart--client-direct-parts)
  - [Multipart — server-proxied parts](#multipart--server-proxied-parts)
- [Retrieving an upload session](#retrieving-an-upload-session)
- [Handling upload verification errors](#handling-upload-verification-errors)
- [Running database migrations](#running-database-migrations)
  - [PostgreSQL / MySQL / SQLite](#postgresql--mysql--sqlite)
  - [Cloudflare D1 — programmatic](#cloudflare-d1--programmatic)
  - [Cloudflare D1 — generate SQL for wrangler](#cloudflare-d1--generate-sql-for-wrangler)

---

## Installation

`core` and `shared` are always required. Add provider packages as needed.

The packages are published to npmjs.com under the `@vankyle` scope and install from there by default — no authentication or registry configuration is required. GitHub Packages is also available as an alternative mirror under the `@vankyle-hub` scope; installing from it requires configuring the registry and authentication first as described in [github-packages.md](github-packages.md).

```bash
pnpm add @vankyle/storage-core @vankyle/storage-shared
```

| Scenario | Additional packages |
|---|---|
| AWS S3 / R2 HTTP / MinIO | `@vankyle/storage-s3` |
| Azure Blob + Cosmos DB | `@vankyle/storage-azure` |
| Cloudflare R2 Binding + D1 | `@vankyle/storage-cloudflare` |
| PostgreSQL / MySQL / SQLite | `@vankyle/storage-kysely` + `kysely` |

---

## S3 + PostgreSQL (Kysely)

```typescript
import { S3Storage } from "@vankyle/storage-s3";
import { KyselyMetadataStore } from "@vankyle/storage-kysely";
import { DefaultStorageService } from "@vankyle/storage-core";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { StorageDatabase } from "@vankyle/storage-kysely";

const storage = new S3Storage({
  clientConfig: {
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
});

const db = new Kysely<StorageDatabase>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});

const metadata = new KyselyMetadataStore(db);

export const storageService = new DefaultStorageService({
  storage,
  metadata,
  bucket: process.env.S3_BUCKET!,
  objectKeyPrefix: "uploads/",
  defaultUploadExpiresInSeconds: 3600,
  defaultReadUrlExpiresInSeconds: 900,
});
```

---

## S3 + MySQL (Kysely)

```typescript
import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";

const db = new Kysely<StorageDatabase>({
  dialect: new MysqlDialect({
    pool: createPool({
      uri: process.env.DATABASE_URL,
      timezone: "Z", // required: time columns hold UTC
    }),
  }),
});

const metadata = new KyselyMetadataStore(db);
```

Everything else is identical to the PostgreSQL example; migrations take the `"mysql"` database type. The pool must be created with `timezone: "Z"` (or `dateStrings: true`) — the store refuses to run otherwise. MySQL 5.6.4+, 5.7 and 8.x are supported; see [migrations.md](migrations.md#mysql-schema-and-time-handling).

---

## Azure Blob + Cosmos DB

```typescript
import { AzureBlobStorage, CosmosMetadataStore } from "@vankyle/storage-azure";
import { DefaultStorageService } from "@vankyle/storage-core";

const storage = new AzureBlobStorage({
  accountName: process.env.AZURE_STORAGE_ACCOUNT!,
  accountKey: process.env.AZURE_STORAGE_KEY!,
});

const metadata = new CosmosMetadataStore({
  connectionString: process.env.COSMOS_CONNECTION_STRING!,
  databaseId: "my-database",
});

export const storageService = new DefaultStorageService({
  storage,
  metadata,
  bucket: process.env.AZURE_CONTAINER!,
});
```

Alternatively, construct with an endpoint + key:

```typescript
const metadata = new CosmosMetadataStore({
  endpoint: process.env.COSMOS_ENDPOINT!,
  key: process.env.COSMOS_KEY!,
  databaseId: "my-database",
});
```

---

## Cloudflare Worker: R2 Binding + D1

```typescript
// wrangler.toml bindings:
// [[r2_buckets]]  binding = "BUCKET", bucket_name = "my-bucket"
// [[d1_databases]] binding = "DB",    database_name = "my-db"

import { R2BindingStorage, D1Dialect } from "@vankyle/storage-cloudflare";
import { KyselyMetadataStore } from "@vankyle/storage-kysely";
import { DefaultStorageService } from "@vankyle/storage-core";
import { Kysely } from "kysely";
import type { StorageDatabase } from "@vankyle/storage-kysely";

interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const storage = new R2BindingStorage(env.BUCKET);

    const db = new Kysely<StorageDatabase>({
      dialect: new D1Dialect(env.DB),
    });

    const metadata = new KyselyMetadataStore(db);

    const service = new DefaultStorageService({
      storage,
      metadata,
      bucket: "my-bucket",
    });

    // ... handle request
  },
};
```

> **Note:** `R2BindingStorage` does not support presigned URLs, so `createUploadSession` returns no `uploadUrl`. For single-mode uploads the client sends the data to your Worker endpoint, which writes it with `service.uploadObject(...)` and then calls `service.completeUploadSession(...)` — see [Single file — server-side upload](#single-file--server-side-upload). `service.uploadPart(...)` is for multipart sessions only.

---

## Upload patterns

### Single file — client direct upload

This is the most efficient pattern when your storage provider supports presigned PUT URLs (S3, Azure Blob).

**Step 1 — Backend: create session and get upload URL**

```typescript
import { UploadMode } from "@vankyle/storage-core";

const { session, uploadUrl } = await storageService.createUploadSession({
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  mode: UploadMode.Single,
  expectedSize: 348_112, // bytes, as announced by the client
  ownerId: currentUser.id,
});

// Send session.id and uploadUrl to the client
```

Pass `expectedSize` whenever the client can tell you the file size. On S3-compatible storage it is bound into the presigned URL: an upload of any other size is rejected by the storage itself (HTTP 403) and nothing is stored. On Azure Blob the URL cannot be size-bound, so the size is checked when you call `completeUploadSession`. Either way `completeUploadSession` verifies it.

**Step 2 — Client: PUT directly to storage**

```typescript
await fetch(uploadUrl.url, {
  method: uploadUrl.method,
  headers: uploadUrl.headers,
  body: fileBlob,
});
```

**Step 3 — Backend: complete the upload**

```typescript
const { blob, file, fileVersion } = await storageService.completeUploadSession({
  sessionId: session.id,
  createFile: { displayName: "My Photo" },
});
```

---

### Single file — server-side upload

Use this when the server already holds the bytes: the client posts the file to your endpoint, your code generated the content, or the storage provider cannot issue presigned PUT URLs (R2 Binding). The object is written with one `IStorage.putObject` call — no multipart session is needed.

The flow is `createUploadSession` → `uploadObject` → `completeUploadSession`:

```typescript
import { UploadMode } from "@vankyle/storage-core";

// 1. Create a single-mode session. `uploadUrl` is not needed here.
const { session } = await storageService.createUploadSession({
  fileName: "report.pdf",
  mimeType: "application/pdf",
  mode: UploadMode.Single,
  expectedSize: bytes.byteLength, // optional; verified on complete
  ownerId: currentUser.id,
});

// 2. Write the bytes through the server.
const { etag } = await storageService.uploadObject({
  sessionId: session.id,
  body: bytes,                    // Uint8Array | ReadableStream<Uint8Array>
});

// 3. Verify the stored object and create the blob (and file) records.
const { blob, file } = await storageService.completeUploadSession({
  sessionId: session.id,
  etag,                           // optional; verified against the stored object
  createFile: { displayName: "Q1 Report" },
});
```

Things to know:

- **Content length.** For a `Uint8Array` the byte length is used. For a `ReadableStream`, pass `contentLength`; if you omit it, the session's `expectedSize` is used. Some providers (S3) reject or buffer a stream of unknown length.
- **Content type** comes from the session's `mimeType`.
- **Nothing is final until `completeUploadSession`.** `uploadObject` stores the object and moves the session to `in-progress`; it does not create a blob. Calling `uploadObject` again before completing overwrites the object, so a failed write can simply be retried.
- **Errors.** `uploadObject` throws `ValidationError` with `field: "mode"` for a multipart session (use `uploadPart` there) and with `field: "status"` for a session that is already completed or aborted. Conversely, `uploadPart` and `getUploadPartUrl` throw `ValidationError` with `field: "mode"` for a single-mode session.

In a Cloudflare Worker with an R2 binding:

```typescript
if (request.method === "PUT" && url.pathname.startsWith("/upload/")) {
  const sessionId = url.pathname.slice("/upload/".length);
  await service.uploadObject({
    sessionId,
    body: request.body!,
    contentLength: Number(request.headers.get("content-length")),
  });
  const { blob } = await service.completeUploadSession({ sessionId });
  return Response.json({ blobId: blob.id });
}
```

---

### Multipart — client-direct parts

Use this for large files (typically > 100 MB) where parts are uploaded directly from the client.

**Step 1 — Backend: create multipart session**

```typescript
const { session } = await storageService.createUploadSession({
  fileName: "video.mp4",
  mimeType: "video/mp4",
  mode: UploadMode.Multipart,
});
```

**Step 2 — Backend: get presigned URL for each part**

```typescript
// Repeat for each part (1-indexed)
const signedAccess = await storageService.getUploadPartUrl({
  sessionId: session.id,
  partNumber: 1,
  expiresInSeconds: 3600,
});

// Send signedAccess.url to the client for part 1
```

**Step 3 — Client: upload each part**

```typescript
const response = await fetch(signedAccess.url, {
  method: signedAccess.method,
  body: partChunk,
});
const etag = response.headers.get("ETag");
```

To stop a client from uploading a part larger than agreed, pass the part's size as `contentLength` to `getUploadPartUrl` in step 2. On S3-compatible storage the URL then only accepts a body of exactly that size.

**Step 4 — Backend: register completed parts**

```typescript
await storageService.registerPart({
  sessionId: session.id,
  partNumber: 1,
  size: partChunk.byteLength,
  etag: etag,
});
```

**Step 5 — Backend: complete**

```typescript
const { blob, file } = await storageService.completeUploadSession({
  sessionId: session.id,
  createFile: { displayName: "Big Video" },
});
```

---

### Multipart — server-proxied parts

Use this when the client cannot upload directly (e.g. R2 Binding, internal networks) and the file is too large for a single PUT. For files that fit in one request, prefer [Single file — server-side upload](#single-file--server-side-upload). `uploadPart` only accepts multipart sessions.

```typescript
// In your upload endpoint (receives raw part stream from client)
const part = await storageService.uploadPart({
  sessionId: req.body.sessionId,
  partNumber: req.body.partNumber,
  body: req.body.stream,   // ReadableStream | Buffer
  size: req.body.size,
});
```

The rest of the flow (complete, register) is identical to the direct upload pattern.

---

## Retrieving an upload session

Use `getUploadSession` to fetch the current state of an upload session. This is useful when the caller needs to recover the original `fileName`, `mimeType`, `expectedSize`, `expectedSha256`, or `metadata` that were provided at session creation time — for example, before calling `completeUploadSession` from a different request context.

```typescript
const session = await storageService.getUploadSession(sessionId);
if (!session) {
  // session not found
}

// Access all fields saved when the session was created:
console.log(session.fileName);      // e.g. "photo.jpg"
console.log(session.mimeType);      // e.g. "image/jpeg"
console.log(session.expectedSize);  // declared size in bytes
console.log(session.expectedSha256);// declared checksum
console.log(session.metadata);      // application-defined metadata
console.log(session.status);        // "pending" | "in-progress" | "completed" | "aborted"
```

Returns `undefined` when the session ID is not found.

---

## Handling upload verification errors

`completeUploadSession` verifies the stored object before it writes any metadata. Two typed errors from `@vankyle/storage-shared` report a failed check; both carry `sessionId`, `expected`, and `actual`:

| Error | `code` | Raised when |
|---|---|---|
| `UploadSizeMismatchError` | `UPLOAD_SIZE_MISMATCH` | The session was created with `expectedSize` and the stored object has a different size |
| `UploadEtagMismatchError` | `UPLOAD_ETAG_MISMATCH` | You passed `etag` to `completeUploadSession` and the stored object's ETag differs (compared verbatim, including quotes) |

```typescript
import {
  UploadSizeMismatchError,
  UploadEtagMismatchError,
} from "@vankyle/storage-shared";

try {
  await storageService.completeUploadSession({ sessionId, etag });
} catch (error) {
  if (error instanceof UploadSizeMismatchError) {
    // e.g. truncated upload: error.expected = 1048576, error.actual = 524288
    return reply.status(422).send({
      code: error.code,
      expected: error.expected,
      actual: error.actual,
    });
  }
  if (error instanceof UploadEtagMismatchError) {
    return reply.status(409).send({ code: error.code });
  }
  throw error;
}
```

`actual` is `undefined` when the provider reported no size or ETag. Because nothing has been written yet, the session is still open after either error: let the client upload again and call `completeUploadSession` once more, or call `abortUploadSession`. If your code runs across package or bundle boundaries where `instanceof` is unreliable, branch on `error.code` instead.

---

## Generating a download URL

```typescript
const { url } = await storageService.getReadUrl({
  fileId: file.id,
  expiresInSeconds: 300,
});
```

---

## Deleting a file

Files are soft-deleted by default. The blob's physical object is not removed.

```typescript
await storageService.deleteFile({ fileId: file.id });
```

Orphaned blobs (blobs with no remaining references) are marked with `BlobStatus.Orphaned`. Physical cleanup is left to a separate garbage-collection process.

---

## Running database migrations

Migrations are database-type-aware. Pass `'postgres'`, `'mysql'`, or `'sqlite'` to get DDL that matches your database's type system. For a full reference see [migrations.md](migrations.md).

> **Upgrading from 0.4.x on PostgreSQL?** Migration `0002_timestamptz` converts the time columns to `timestamptz` and needs to know which time zone the existing values were written in. Read [Migration 0002](migrations.md#migration-0002--time-zone-aware-timestamps) before running `migrateToLatest()` against a database that already holds data.

### PostgreSQL / MySQL / SQLite

```typescript
import { Migrator } from "kysely/migration";
import { createMigrationProvider } from "@vankyle/storage-kysely";

const migrator = new Migrator({
  db,
  provider: createMigrationProvider("postgres"),
});

const { error, results } = await migrator.migrateToLatest();
```

For MySQL or standard SQLite pass `"mysql"` or `"sqlite"` respectively. Never pass `"postgres"` for MySQL. SQL Server is not supported; see [migrations.md](migrations.md#unsupported-databases).

If the existing PostgreSQL data was written by processes running in a zone other than UTC, pass it once, for the run that applies `0002`:

```typescript
provider: createMigrationProvider("postgres", {
  timestampSourceTimeZone: "Asia/Shanghai",
}),
```

### Cloudflare D1 — programmatic

Use `'sqlite'` with the Kysely `Migrator` inside your Worker or a setup script:

```typescript
import { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { createMigrationProvider } from "@vankyle/storage-kysely";
import { D1Dialect } from "@vankyle/storage-cloudflare";

const db = new Kysely({ dialect: new D1Dialect(env.DB) });
const migrator = new Migrator({
  db,
  provider: createMigrationProvider("sqlite"),
});
await migrator.migrateToLatest();
```

### Cloudflare D1 — generate SQL for wrangler

Use `generateAllMigrationSql` at build time to produce `.sql` files for `wrangler d1 migrations apply`:

```typescript
import { generateAllMigrationSql } from "@vankyle/storage-kysely";
import { writeFileSync } from "node:fs";

const migrations = await generateAllMigrationSql("sqlite");
for (const [key, sql] of Object.entries(migrations)) {
  writeFileSync(`migrations/${key}.sql`, sql);
}
```

Then apply with wrangler:

```bash
wrangler d1 migrations apply my-db
```

This creates the tables `upload_sessions`, `uploaded_parts`, `blobs`, `blob_references`, `files`, and `file_versions` along with all required indexes.

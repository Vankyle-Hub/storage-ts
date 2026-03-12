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
  - [Multipart — client-direct parts](#multipart--client-direct-parts)
  - [Multipart — server-proxied parts](#multipart--server-proxied-parts)
- [Running database migrations](#running-database-migrations)

---

## Installation

`core` and `shared` are always required. Add provider packages as needed.

If you are installing from GitHub Packages, configure the registry and authentication first as described in [github-packages.md](github-packages.md).

```bash
pnpm add @vankyle-hub/storage-core @vankyle-hub/storage-shared
```

| Scenario | Additional packages |
|---|---|
| AWS S3 / R2 HTTP / MinIO | `@vankyle-hub/storage-s3` |
| Azure Blob + Cosmos DB | `@vankyle-hub/storage-azure` |
| Cloudflare R2 Binding + D1 | `@vankyle-hub/storage-cloudflare` |
| PostgreSQL / MySQL / SQLite | `@vankyle-hub/storage-kysely` + `kysely` |

---

## S3 + PostgreSQL (Kysely)

```typescript
import { S3Storage } from "@vankyle-hub/storage-s3";
import { KyselyMetadataStore } from "@vankyle-hub/storage-kysely";
import { DefaultStorageService } from "@vankyle-hub/storage-core";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

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
import { MysqlDialect } from "kysely";
import { createPool } from "mysql2";

const db = new Kysely<StorageDatabase>({
  dialect: new MysqlDialect({
    pool: createPool({ uri: process.env.DATABASE_URL }),
  }),
});
```

Everything else is identical to the PostgreSQL example.

---

## Azure Blob + Cosmos DB

```typescript
import { AzureBlobStorage, CosmosMetadataStore } from "@vankyle-hub/storage-azure";
import { DefaultStorageService } from "@vankyle-hub/storage-core";

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

import { R2BindingStorage, D1Dialect } from "@vankyle-hub/storage-cloudflare";
import { KyselyMetadataStore } from "@vankyle-hub/storage-kysely";
import { DefaultStorageService } from "@vankyle-hub/storage-core";
import { Kysely } from "kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const storage = new R2BindingStorage(env.BUCKET);

    const db = new Kysely<StorageDatabase>({
      dialect: new D1Dialect({ database: env.DB }),
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

> **Note:** `R2BindingStorage` does not support presigned URLs. For single-mode uploads the client must send data through your Worker endpoint, which then calls `service.uploadPart(...)`.

---

## Upload patterns

### Single file — client direct upload

This is the most efficient pattern when your storage provider supports presigned PUT URLs (S3, Azure Blob).

**Step 1 — Backend: create session and get upload URL**

```typescript
import { UploadMode } from "@vankyle-hub/storage-core";

const { session, uploadUrl } = await storageService.createUploadSession({
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  mode: UploadMode.Single,
  ownerId: currentUser.id,
});

// Send session.id and uploadUrl to the client
```

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

Use this when the client cannot upload directly (e.g. R2 Binding, internal networks).

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

The `kysely` package ships with a migration:

```typescript
import { Migrator } from "kysely";
import { migrations } from "@vankyle-hub/storage-kysely";

const migrator = new Migrator({
  db,
  provider: {
    getMigrations: async () => migrations,
  },
});

const { error, results } = await migrator.migrateToLatest();
```

This creates the tables `upload_sessions`, `uploaded_parts`, `blobs`, `blob_references`, `files`, and `file_versions` along with all required indexes.

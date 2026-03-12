# @vankyle-hub/storage-cloudflare

Cloudflare Workers adapters for `vankyle-storage`:

- **`R2BindingStorage`** — `IStorage` using the native Cloudflare R2 Worker binding API.
- **`D1Dialect`** — Kysely `Dialect` for Cloudflare D1, enabling `KyselyMetadataStore` to work on D1.

## Installation

```bash
pnpm add @vankyle-hub/storage-cloudflare @vankyle-hub/storage-core @vankyle-hub/storage-shared
```

For metadata on D1, also install:

```bash
pnpm add @vankyle-hub/storage-kysely kysely
```

## R2 Binding Storage

Use `R2BindingStorage` when running inside a Cloudflare Worker and you have a direct `R2Bucket` binding (i.e. `env.BUCKET`).

> For Cloudflare R2 accessed via the S3-compatible HTTP API (outside of Workers), use [`@vankyle-hub/storage-s3`](../s3/README.md) instead.

### Setup

```typescript
import { R2BindingStorage } from "@vankyle-hub/storage-cloudflare";

interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const storage = new R2BindingStorage(env.BUCKET);
    // ...
  },
};
```

### Capabilities

| Capability | Supported |
|---|---|
| `multipartUpload` | ✓ |
| `signedReadUrl` | ✗ |
| `signedPutUrl` | ✗ |
| `signedPartUrl` | ✗ |

Workers with R2 bindings cannot issue presigned URLs — all data transfers go through the Worker itself. For single-mode uploads, the client must POST to your Worker which calls `service.uploadPart(...)`.

### Multipart upload

`R2BindingStorage` uses the native R2 multipart API:

| `IStorage` method | R2 Binding API |
|---|---|
| `initUploadSession` | `bucket.createMultipartUpload()` |
| `uploadPart` | `multipart.uploadPart()` |
| `completeUploadSession` | `multipart.complete()` |
| `abortUploadSession` | `multipart.abort()` |

The `providerUploadId` returned by `initUploadSession` is the R2 `uploadId`.

---

## D1 Kysely Dialect

`D1Dialect` adapts Cloudflare D1 to the Kysely query builder interface. This allows `KyselyMetadataStore` from `@vankyle-hub/storage-kysely` to run on D1 without any additional code changes.

### Setup

```typescript
import { D1Dialect } from "@vankyle-hub/storage-cloudflare";
import { KyselyMetadataStore } from "@vankyle-hub/storage-kysely";
import { Kysely } from "kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

interface Env {
  DB: D1Database;
}

// Inside your Worker handler:
const db = new Kysely<StorageDatabase>({
  dialect: new D1Dialect({ database: env.DB }),
});

const metadata = new KyselyMetadataStore(db);
```

### Limitations

D1 does not support:
- Traditional transactions (`BEGIN` / `COMMIT` / `ROLLBACK`). Transaction calls in `D1Dialect` are stubbed.
- Query streaming. Calling `streamQuery` will throw.

---

## Complete Worker example

```typescript
import { R2BindingStorage, D1Dialect } from "@vankyle-hub/storage-cloudflare";
import { KyselyMetadataStore } from "@vankyle-hub/storage-kysely";
import { DefaultStorageService, UploadMode } from "@vankyle-hub/storage-core";
import { Kysely } from "kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const storage = new R2BindingStorage(env.BUCKET);
    const db = new Kysely<StorageDatabase>({ dialect: new D1Dialect({ database: env.DB }) });
    const metadata = new KyselyMetadataStore(db);

    const service = new DefaultStorageService({
      storage,
      metadata,
      bucket: "my-bucket",
    });

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/upload/start") {
      const body = await request.json<{ fileName: string }>();
      const { session } = await service.createUploadSession({
        fileName: body.fileName,
        mode: UploadMode.Single,
      });
      return Response.json({ sessionId: session.id });
    }

    // ... additional routes
    return new Response("Not Found", { status: 404 });
  },
};
```

## D1 Migrations

Run migrations from `@vankyle-hub/storage-kysely` using the Kysely `Migrator` with `D1Dialect`. The SQL is compatible with SQLite, which D1 is based on.

```typescript
import { Migrator } from "kysely";
import { migrations } from "@vankyle-hub/storage-kysely";

const migrator = new Migrator({
  db,
  provider: { getMigrations: async () => migrations },
});

await migrator.migrateToLatest();
```

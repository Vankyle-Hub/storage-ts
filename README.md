# vankyle-storage

A unified file and object storage infrastructure SDK for TypeScript, built around a domain-first, ports-and-adapters architecture. It abstracts over object storage backends, metadata stores, and upload strategies so your application code remains provider-agnostic.

## Design Goals

- **Domain-first** — business objects (`File`, `Blob`, `UploadSession`) are defined in pure TypeScript with no provider dependencies.
- **Port-and-adapter** — `IStorage`, `IMetadataStore`, and `IStorageService` are abstract interfaces. Providers are swappable without touching application code.
- **Provider-packaged** — each cloud ecosystem ships as its own package (`azure`, `cloudflare`, `s3`, `kysely`).
- **Metadata–storage decoupled** — object storage and metadata storage are independent concerns and can use different providers simultaneously.
- **Application-service orchestrated** — `DefaultStorageService` encapsulates the full upload/download lifecycle; callers only need `IStorageService`.

## Monorepo Structure

```
packages/
  core/         Domain models, interfaces, application service
  shared/       Cross-package utilities, errors, and types
  s3/           S3-compatible object storage adapter
  azure/        Azure Blob Storage + Cosmos DB adapters
  cloudflare/   Cloudflare R2 Binding storage + D1 Kysely dialect
  kysely/       SQL metadata store via Kysely (PostgreSQL, MySQL, SQLite, D1)
```

## Packages

| Package | npm name | Description |
|---|---|---|
| [core](packages/core) | `@vankyle-hub/storage-core` | Domain models, port interfaces, and `DefaultStorageService` |
| [shared](packages/shared) | `@vankyle-hub/storage-shared` | Base errors, `Result` type, and utility helpers |
| [s3](packages/s3) | `@vankyle-hub/storage-s3` | IStorage for AWS S3, Cloudflare R2 (HTTP), MinIO, and any S3-compatible backend |
| [azure](packages/azure) | `@vankyle-hub/storage-azure` | IStorage for Azure Blob Storage + IMetadataStore for Cosmos DB |
| [cloudflare](packages/cloudflare) | `@vankyle-hub/storage-cloudflare` | IStorage for R2 Worker Binding + Kysely dialect for D1 |
| [kysely](packages/kysely) | `@vankyle-hub/storage-kysely` | IMetadataStore backed by any Kysely-compatible SQL database |

## Architecture Overview

```
Your Application
      │
      ▼
IStorageService  (core)
      │
      ├── IStorage        IMetadataStore
      │       │                  │
      │    ┌──┴──────────┐   ┌───┴────────────────────┐
      │    │   s3        │   │  kysely                 │
      │    │   azure     │   │  azure (cosmos)         │
      │    │   cloudflare│   │  cloudflare (d1)        │
      │    └─────────────┘   └────────────────────────┘
      │
      └── Domain: File, Blob, FileVersion, UploadSession, UploadedPart, BlobReference
```

See [docs/architecture.md](docs/architecture.md) for the full design.

## Quick Start

Install the packages you need:

```bash
# Core is always required
pnpm add @vankyle-hub/storage-core @vankyle-hub/storage-shared

# Add provider packages as needed
pnpm add @vankyle-hub/storage-s3       # AWS S3, R2 HTTP, MinIO
pnpm add @vankyle-hub/storage-kysely   # PostgreSQL / MySQL / SQLite / D1
pnpm add @vankyle-hub/storage-azure    # Azure Blob + Cosmos DB
pnpm add @vankyle-hub/storage-cloudflare  # R2 Worker Binding + D1 dialect
```

### Basic usage: S3 + Kysely (PostgreSQL)

```typescript
import { S3Storage } from "@vankyle-hub/storage-s3";
import { KyselyMetadataStore } from "@vankyle-hub/storage-kysely";
import { DefaultStorageService } from "@vankyle-hub/storage-core";
import { Kysely, PostgresDialect } from "kysely";
import type { StorageDatabase } from "@vankyle-hub/storage-kysely";

// 1. Object storage adapter
const storage = new S3Storage({
  clientConfig: {
    region: "us-east-1",
    credentials: { accessKeyId: "...", secretAccessKey: "..." },
  },
});

// 2. Metadata store
const db = new Kysely<StorageDatabase>({ dialect: new PostgresDialect({ ... }) });
const metadata = new KyselyMetadataStore(db);

// 3. Application service
const service = new DefaultStorageService({
  storage,
  metadata,
  bucket: "my-bucket",
  objectKeyPrefix: "uploads/",
});

// Upload a file
const session = await service.createUploadSession({
  fileName: "report.pdf",
  mimeType: "application/pdf",
  mode: UploadMode.Single,
});

// Complete upload and create a File record
const { blob, file } = await service.completeUploadSession({
  sessionId: session.id,
  createFile: { displayName: "Q1 Report" },
});

// Generate a download URL
const { url } = await service.getReadUrl({ fileId: file.id });
```

See [docs/getting-started.md](docs/getting-started.md) for more examples including multipart uploads, Azure, and Cloudflare Workers.

## GitHub Packages

This repository is configured to publish packages to GitHub Packages.

If you are consuming these packages from GitHub Packages, configure authentication first and then install the package scope from `https://npm.pkg.github.com`.

```ini
@vankyle-hub:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
always-auth=true
```

Maintainer and consumer instructions are documented in [docs/github-packages.md](docs/github-packages.md).

## Development

This project uses [pnpm workspaces](https://pnpm.io/workspaces).

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck

# Run all tests
pnpm test

# Watch mode
pnpm dev
```

## License

[MPL-2.0](LICENSE)

## Community

- [Contributing guide](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Support guide](SUPPORT.md)

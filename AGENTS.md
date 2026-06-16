# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

`vankyle-storage` is a unified TypeScript SDK for file and object storage using ports-and-adapters (hexagonal) architecture. It decouples object storage (S3, Azure Blob, R2) from metadata persistence (SQL via Kysely, Cosmos DB) and orchestrates them through an application service layer.

## Commands

All commands are run from the repo root using pnpm.

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (tsc composite)
pnpm clean            # Remove all dist/ and build artifacts
pnpm typecheck        # Type-check all packages
pnpm test             # Run all tests (vitest)
pnpm dev              # Watch mode across all packages
```

Run a single test file:
```bash
pnpm exec vitest run packages/core/src/application/services/default-storage-service.test.ts
```

Build a single package:
```bash
cd packages/core && pnpm build
```

## Architecture

### Monorepo Package Dependency Graph

```
shared  (errors, Result<T,E>, utility types — no imports from project)
  ↑
core    (domain models, port interfaces, DefaultStorageService — imports shared + zod only)
  ↑
s3 / azure / cloudflare / kysely  (provider adapters — import core + shared)
```

**Strict rule:** provider packages never import each other; `core` never imports provider packages.

### Key Abstractions (in `core`)

- **`IStorage`** — object storage port: `putObject`, `getObject`, `headObject`, multipart upload, signed URLs
- **`IMetadataStore`** — composed of `IUploadSessionStore` + `IBlobStore` + `IFileStore`
- **`IStorageService`** — the application-facing port; implemented by `DefaultStorageService`
- **`DefaultStorageService`** — orchestrates the full upload/download lifecycle by wiring an `IStorage` + `IMetadataStore`

### Domain Models (in `core/src/domain`)

`File` → has many `FileVersion` → each version references a `Blob` → `Blob` is stored at a `StorageLocator`

`UploadSession` tracks in-progress uploads (single or multipart) and transitions to a committed `Blob` on completion.

### Provider Implementations

| Package | `IStorage` impl | `IMetadataStore` impl |
|---|---|---|
| `s3` | `S3Storage` (AWS SDK v3, any S3-compatible) | — |
| `azure` | `AzureBlobStorage` (Block Blob staging) | `CosmosMetadataStore` |
| `cloudflare` | `R2BindingStorage` (Worker binding, no presigned URLs) | — (use `kysely` + `D1Dialect`) |
| `kysely` | — | `KyselyMetadataStore` (PostgreSQL, MySQL, SQLite, D1) |

`cloudflare` also exports `D1Dialect` — a Kysely dialect that lets `KyselyMetadataStore` work over Cloudflare D1 without code changes.

### Error Handling

All errors extend `BaseError` (from `shared`). Key types: `StorageError`, `MetadataError`, `ValidationError`, `CapabilityNotSupportedError`, `MetadataNotFoundError`. Methods that can fail return `Result<T, E>` (railway-oriented, from `shared/src/types/result.ts`).

### TypeScript Configuration

Base config: `tsconfig.base.json` — ES2022 target, ESNext modules, strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Each package has its own `tsconfig.json` extending the base with `composite: true` for project references.

## Package Manager

This repo uses **pnpm** (v10.28.2) exclusively. Do not use npm or yarn.

## Publishing

Packages are published to npmjs.com under the `@vankyle` npm scope (canonical, npm-first) and mirrored to GitHub Packages as `@vankyle-hub`. See `docs/github-packages.md` for configuration.

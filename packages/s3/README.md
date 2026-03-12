# @vankyle-hub/storage-s3

`IStorage` implementation for any S3-compatible object storage backend.

## Supported backends

- AWS S3
- Cloudflare R2 (S3-compatible HTTP API)
- MinIO
- DigitalOcean Spaces
- Backblaze B2 (S3-compatible)
- Any storage that speaks the S3 signature protocol

> **Cloudflare R2 Worker Binding:** If you are running inside a Cloudflare Worker and want to use `env.BUCKET` directly, use [`@vankyle-hub/storage-cloudflare`](../cloudflare/README.md) instead.

## Installation

```bash
pnpm add @vankyle-hub/storage-s3 @vankyle-hub/storage-core @vankyle-hub/storage-shared
```

## Usage

### AWS S3

```typescript
import { S3Storage } from "@vankyle-hub/storage-s3";

const storage = new S3Storage({
  clientConfig: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
});
```

### Cloudflare R2 (S3 API)

```typescript
const storage = new S3Storage({
  clientConfig: {
    region: "auto",
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  },
  forcePathStyle: true,
});
```

### MinIO

```typescript
const storage = new S3Storage({
  clientConfig: {
    region: "us-east-1",
    endpoint: "http://localhost:9000",
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
  },
  forcePathStyle: true,
});
```

## Capabilities

| Capability | Supported |
|---|---|
| `multipartUpload` | ✓ |
| `signedReadUrl` | ✓ |
| `signedPutUrl` | ✓ |
| `signedPartUrl` | ✓ |
| `serverSideCopy` | ✗ |

All four URL types use `@aws-sdk/s3-request-presigner`.

## Options reference

```typescript
interface S3StorageOptions {
  /**
   * Passed directly to the AWS SDK S3Client constructor.
   * Set endpoint, region, credentials, etc. here.
   */
  clientConfig: S3ClientConfig;

  /**
   * Use path-style URLs instead of virtual-hosted style.
   * Required for MinIO and some S3-compatible services.
   * Default: false
   */
  forcePathStyle?: boolean;
}
```

## Multipart upload

`S3Storage` maps the `IStorage` multipart lifecycle directly to S3 multipart:

| `IStorage` method | S3 API |
|---|---|
| `initUploadSession` | `CreateMultipartUpload` |
| `uploadPart` | `UploadPart` |
| `completeUploadSession` | `CompleteMultipartUpload` |
| `abortUploadSession` | `AbortMultipartUpload` |

The `providerUploadId` field on `InitUploadSessionResult` is the S3 `UploadId`.

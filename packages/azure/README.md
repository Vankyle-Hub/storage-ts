# @vankyle-hub/storage-azure

`IStorage` and `IMetadataStore` implementations for the Azure ecosystem.

## What's included

| Class | Interface | Backend |
|---|---|---|
| `AzureBlobStorage` | `IStorage` | Azure Blob Storage |
| `CosmosMetadataStore` | `IMetadataStore` | Azure Cosmos DB |

## Installation

```bash
pnpm add @vankyle-hub/storage-azure @vankyle-hub/storage-core @vankyle-hub/storage-shared
```

## Azure Blob Storage

### Setup

```typescript
import { AzureBlobStorage } from "@vankyle-hub/storage-azure";

// Option 1: connection string
const storage = new AzureBlobStorage({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
});

// Option 2: account name + key
const storage = new AzureBlobStorage({
  accountName: process.env.AZURE_STORAGE_ACCOUNT!,
  accountKey: process.env.AZURE_STORAGE_KEY!,
});

// Option 3: pre-constructed BlobServiceClient
import { BlobServiceClient } from "@azure/storage-blob";
const storage = new AzureBlobStorage({
  blobServiceClient: new BlobServiceClient(url, credential),
});
```

### Capabilities

| Capability | Supported |
|---|---|
| `multipartUpload` | ✓ (via Block Blob staging) |
| `signedReadUrl` | ✓ (SAS token) |
| `signedPutUrl` | ✓ (SAS token) |
| `signedPartUrl` | ✗ |

> Signed URLs require a `StorageSharedKeyCredential`. If you initialize with a pre-built `BlobServiceClient` that uses a different credential type, `createReadUrl` and `createPutUrl` will throw `CapabilityNotSupportedError`.

### Multipart upload

Azure Blob Storage does not have a native multipart upload API. `AzureBlobStorage` simulates it using [Block Blob staging](https://learn.microsoft.com/azure/storage/blobs/storage-blob-block-blob-upload):

| `IStorage` method | Azure API |
|---|---|
| `initUploadSession` | Generates a session UUID (no API call needed) |
| `uploadPart` | `stageBlock` — block ID is base64 of the part number |
| `completeUploadSession` | `commitBlockList` — blocks sorted by `partNumber` |
| `abortUploadSession` | No-op (Azure auto-discards uncommitted blocks) |

## Cosmos DB Metadata Store

All six entity types (`upload-session`, `uploaded-part`, `blob`, `blob-reference`, `file`, `file-version`) are stored in a **single Cosmos container**, discriminated by a `type` field.

### Setup

```typescript
import { CosmosMetadataStore } from "@vankyle-hub/storage-azure";

// Option 1: connection string
const metadata = new CosmosMetadataStore({
  connectionString: process.env.COSMOS_CONNECTION_STRING!,
  databaseId: "my-database",
});

// Option 2: endpoint + key
const metadata = new CosmosMetadataStore({
  endpoint: process.env.COSMOS_ENDPOINT!,
  key: process.env.COSMOS_KEY!,
  databaseId: "my-database",
});
```

The default container ID is `"storage"`. The container must exist before first use and must have `/id` as the partition key.

### Options reference

```typescript
interface CosmosMetadataOptions {
  /** Full connection string (alternative to endpoint+key) */
  connectionString?: string;
  /** Cosmos DB account endpoint */
  endpoint?: string;
  /** Cosmos DB account key */
  key?: string;
  /** Database ID (required) */
  databaseId: string;
  /** Container ID — defaults to "storage" */
  containerId?: string;
}
```

## Using both together

```typescript
import { AzureBlobStorage, CosmosMetadataStore } from "@vankyle-hub/storage-azure";
import { DefaultStorageService } from "@vankyle-hub/storage-core";

const service = new DefaultStorageService({
  storage: new AzureBlobStorage({
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
  }),
  metadata: new CosmosMetadataStore({
    connectionString: process.env.COSMOS_CONNECTION_STRING!,
    databaseId: "storage-db",
  }),
  bucket: process.env.AZURE_CONTAINER!,
});
```

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

### Container setup

The container **must** be created with partition key path **`/pk`**.

Each document type uses a synthetic `pk` value that co-locates parent and child entities in the same logical partition:

| Document type | `pk` value | Rationale |
|---|---|---|
| `file` | `id` | File is its own partition root |
| `file-version` | `fileId` | Versions sit with their parent file |
| `blob` | `id` | Blob is its own partition root |
| `blob-reference` | `blobId` | References sit with their parent blob |
| `upload-session` | `id` | Session is its own partition root |
| `uploaded-part` | `sessionId` | Parts sit with their parent session |

This design ensures that the most frequent queries (`listVersions`, `listParts`, `listReferences`) are single-partition operations.

#### Creating the container manually

If you need to create and pass in a `Container` object yourself:

```typescript
import { CosmosClient } from "@azure/cosmos";
import { CosmosMetadataStore } from "@vankyle-hub/storage-azure";

const client = new CosmosClient(connectionString);
const { database } = await client.databases.createIfNotExists({ id: "my-database" });
const { container } = await database.containers.createIfNotExists({
  id: "storage",
  partitionKey: { paths: ["/pk"] },
});

const metadata = new CosmosMetadataStore(container);
```

#### Using Bicep / ARM templates

```bicep
resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: 'storage'
  parent: cosmosDatabase
  properties: {
    resource: {
      id: 'storage'
      partitionKey: {
        paths: ['/pk']
        kind: 'Hash'
        version: 2
      }
    }
  }
}
```

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

The default container ID is `"storage"`. Pass `containerId` in options to override.

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

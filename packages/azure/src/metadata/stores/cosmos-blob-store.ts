import type { Container } from "@azure/cosmos";
import type {
  IBlobStore,
  CreateBlobInput,
  UpdateBlobInput,
  CreateBlobReferenceInput,
} from "@vankyle-hub/storage-core";
import type { Blob, BlobReference, StorageProvider } from "@vankyle-hub/storage-core";
import { BlobStatus } from "@vankyle-hub/storage-core";
import {
  type BlobDoc,
  type BlobReferenceDoc,
  blobDocToModel,
  blobReferenceDocToModel,
} from "../mappers/blob-doc.mapper.js";

export class CosmosBlobStore implements IBlobStore {
  constructor(private readonly container: Container) {}

  async createBlob(input: CreateBlobInput): Promise<Blob> {
    const now = new Date().toISOString();
    const doc: BlobDoc = {
      id: input.id,
      pk: input.id,
      type: "blob",
      provider: input.provider,
      bucket: input.bucket,
      objectKey: input.objectKey,
      size: input.size,
      mimeType: input.mimeType,
      sha256: input.sha256,
      etag: input.etag,
      storageClass: input.storageClass,
      status: BlobStatus.Active,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    const { resource } = await this.container.items.create(doc);
    return blobDocToModel(resource as BlobDoc);
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    try {
      // blob pk = id
      const { resource } = await this.container.item(id, id).read<BlobDoc>();
      if (!resource || resource.type !== "blob") return undefined;
      return blobDocToModel(resource);
    } catch {
      return undefined;
    }
  }

  async updateBlob(id: string, input: UpdateBlobInput): Promise<Blob> {
    // blob pk = id
    const { resource: existing } = await this.container.item(id, id).read<BlobDoc>();
    if (!existing) {
      throw new Error(`Blob not found: ${id}`);
    }

    const updated: BlobDoc = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };

    if (input.status !== undefined) updated.status = input.status;
    if (input.deletedAt !== undefined)
      updated.deletedAt = input.deletedAt.toISOString();

    // blob pk = id
    const { resource } = await this.container.item(id, id).replace(updated);
    return blobDocToModel(resource as BlobDoc);
  }

  async findBlobBySha256(sha256: string): Promise<Blob | undefined> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'blob' AND c.sha256 = @sha256 AND c.status = @status",
      parameters: [
        { name: "@sha256", value: sha256 },
        { name: "@status", value: BlobStatus.Active },
      ],
    };

    const { resources } = await this.container.items.query<BlobDoc>(query).fetchAll();
    if (resources.length === 0) return undefined;
    return blobDocToModel(resources[0]!);
  }

  async findBlobByLocator(
    provider: StorageProvider,
    bucket: string,
    objectKey: string,
  ): Promise<Blob | undefined> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'blob' AND c.provider = @provider AND c.bucket = @bucket AND c.objectKey = @objectKey",
      parameters: [
        { name: "@provider", value: provider },
        { name: "@bucket", value: bucket },
        { name: "@objectKey", value: objectKey },
      ],
    };

    const { resources } = await this.container.items.query<BlobDoc>(query).fetchAll();
    if (resources.length === 0) return undefined;
    return blobDocToModel(resources[0]!);
  }

  async createReference(input: CreateBlobReferenceInput): Promise<BlobReference> {
    const doc: BlobReferenceDoc = {
      id: input.id,
      pk: input.blobId,
      type: "blob-reference",
      blobId: input.blobId,
      refType: input.refType,
      refId: input.refId,
      createdAt: new Date().toISOString(),
    };

    const { resource } = await this.container.items.create(doc);
    return blobReferenceDocToModel(resource as BlobReferenceDoc);
  }

  async listReferences(blobId: string): Promise<BlobReference[]> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'blob-reference' AND c.blobId = @blobId",
      parameters: [{ name: "@blobId", value: blobId }],
    };

    // blob-reference pk = blobId — single-partition query
    const { resources } = await this.container.items
      .query<BlobReferenceDoc>(query, { partitionKey: blobId })
      .fetchAll();
    return resources.map(blobReferenceDocToModel);
  }

  async deleteReference(id: string): Promise<void> {
    // blob-reference pk = blobId — need to find the document first
    const query = {
      query:
        "SELECT * FROM c WHERE c.id = @id AND c.type = 'blob-reference'",
      parameters: [{ name: "@id", value: id }],
    };

    const { resources } = await this.container.items
      .query<BlobReferenceDoc>(query)
      .fetchAll();
    if (resources.length === 0) return;

    const doc = resources[0]!;
    await this.container.item(doc.id, doc.pk).delete();
  }
}

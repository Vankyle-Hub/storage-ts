import type { Container } from "@azure/cosmos";
import type {
  IUploadSessionStore,
  CreateUploadSessionInput,
  UpdateUploadSessionInput,
  CreateUploadedPartInput,
} from "@vankyle-hub/storage-core";
import type { UploadSession, UploadedPart } from "@vankyle-hub/storage-core";
import { UploadSessionStatus } from "@vankyle-hub/storage-core";
import {
  type UploadSessionDoc,
  type UploadedPartDoc,
  uploadSessionDocToModel,
  uploadedPartDocToModel,
} from "../mappers/upload-session-doc.mapper.js";

export class CosmosUploadSessionStore implements IUploadSessionStore {
  constructor(private readonly container: Container) {}

  async createSession(input: CreateUploadSessionInput): Promise<UploadSession> {
    const now = new Date().toISOString();
    const doc: UploadSessionDoc = {
      id: input.id,
      pk: input.id,
      type: "upload-session",
      provider: input.provider,
      bucket: input.bucket,
      objectKey: input.objectKey,
      mode: input.mode,
      status: UploadSessionStatus.Pending,
      fileName: input.fileName,
      mimeType: input.mimeType,
      expectedSize: input.expectedSize,
      expectedSha256: input.expectedSha256,
      providerUploadId: input.providerUploadId,
      providerSessionData: input.providerSessionData,
      createdBy: input.createdBy,
      ownerId: input.ownerId,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt?.toISOString(),
    };

    const { resource } = await this.container.items.create(doc);
    return uploadSessionDocToModel(resource as UploadSessionDoc);
  }

  async getSession(id: string): Promise<UploadSession | undefined> {
    try {
      // upload-session pk = id
      const { resource } = await this.container.item(id, id).read<UploadSessionDoc>();
      if (!resource || resource.type !== "upload-session") return undefined;
      return uploadSessionDocToModel(resource);
    } catch {
      return undefined;
    }
  }

  async updateSession(
    id: string,
    input: UpdateUploadSessionInput,
  ): Promise<UploadSession> {
    // upload-session pk = id
    const { resource: existing } = await this.container.item(id, id).read<UploadSessionDoc>();
    if (!existing) {
      throw new Error(`UploadSession not found: ${id}`);
    }

    const updated: UploadSessionDoc = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };

    if (input.status !== undefined) updated.status = input.status;
    if (input.providerUploadId !== undefined)
      updated.providerUploadId = input.providerUploadId;
    if (input.providerSessionData !== undefined)
      updated.providerSessionData = input.providerSessionData;
    if (input.completedAt !== undefined)
      updated.completedAt = input.completedAt.toISOString();
    if (input.abortedAt !== undefined)
      updated.abortedAt = input.abortedAt.toISOString();

    // upload-session pk = id
    const { resource } = await this.container.item(id, id).replace(updated);
    return uploadSessionDocToModel(resource as UploadSessionDoc);
  }

  async addPart(input: CreateUploadedPartInput): Promise<UploadedPart> {
    const doc: UploadedPartDoc = {
      id: input.id,
      pk: input.sessionId,
      type: "uploaded-part",
      sessionId: input.sessionId,
      partNumber: input.partNumber,
      size: input.size,
      etag: input.etag,
      checksumSha256: input.checksumSha256,
      providerPartId: input.providerPartId,
      providerPartData: input.providerPartData,
      uploadedAt: new Date().toISOString(),
    };

    const { resource } = await this.container.items.create(doc);
    return uploadedPartDocToModel(resource as UploadedPartDoc);
  }

  async getPart(
    sessionId: string,
    partNumber: number,
  ): Promise<UploadedPart | undefined> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'uploaded-part' AND c.sessionId = @sessionId AND c.partNumber = @partNumber",
      parameters: [
        { name: "@sessionId", value: sessionId },
        { name: "@partNumber", value: partNumber },
      ],
    };

    // uploaded-part pk = sessionId — single-partition query
    const { resources } = await this.container.items.query<UploadedPartDoc>(query, { partitionKey: sessionId }).fetchAll();
    if (resources.length === 0) return undefined;
    return uploadedPartDocToModel(resources[0]!);
  }

  async listParts(sessionId: string): Promise<UploadedPart[]> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'uploaded-part' AND c.sessionId = @sessionId ORDER BY c.partNumber",
      parameters: [{ name: "@sessionId", value: sessionId }],
    };

    // uploaded-part pk = sessionId — single-partition query
    const { resources } = await this.container.items.query<UploadedPartDoc>(query, { partitionKey: sessionId }).fetchAll();
    return resources.map(uploadedPartDocToModel);
  }
}

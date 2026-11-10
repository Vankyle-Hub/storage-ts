import type { Container } from "@azure/cosmos";
import type {
  IUploadSessionStore,
  CreateUploadSessionInput,
  UpdateUploadSessionInput,
  CreateUploadedPartInput,
} from "@vankyle/storage-core";
import type { UploadSession, UploadedPart } from "@vankyle/storage-core";
import { UploadSessionStatus } from "@vankyle/storage-core";
import {
  type UploadSessionDoc,
  type UploadedPartDoc,
  uploadSessionDocToModel,
  uploadedPartDocToModel,
} from "@/metadata/mappers/upload-session-doc.mapper";

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
    // Cosmos has no unique index to lean on here, so the document id itself
    // identifies the part: registering the same part number again upserts
    // the same document and replaces the earlier registration atomically.
    // The caller's input.id is not used.
    const doc: UploadedPartDoc = {
      id: partDocumentId(input.sessionId, input.partNumber),
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

    const { resource } = await this.container.items.upsert(doc);
    return uploadedPartDocToModel(resource as unknown as UploadedPartDoc);
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
    const [current] = latestPerPartNumber(resources);
    return current ? uploadedPartDocToModel(current) : undefined;
  }

  async listParts(sessionId: string): Promise<UploadedPart[]> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'uploaded-part' AND c.sessionId = @sessionId ORDER BY c.partNumber",
      parameters: [{ name: "@sessionId", value: sessionId }],
    };

    // uploaded-part pk = sessionId — single-partition query
    const { resources } = await this.container.items.query<UploadedPartDoc>(query, { partitionKey: sessionId }).fetchAll();
    return latestPerPartNumber(resources).map(uploadedPartDocToModel);
  }
}

/** Document id of a part: one document per (session, part number). */
function partDocumentId(sessionId: string, partNumber: number): string {
  return `${sessionId}:${partNumber}`;
}

/**
 * One document per part number — the most recently uploaded — in ascending
 * part number order.
 *
 * Parts written by this store have a deterministic id and cannot repeat.
 * Versions up to 0.5.0 gave every registration a random id, so a session
 * that was in flight across the upgrade may still hold several documents
 * for one part number; only the latest registration counts.
 */
function latestPerPartNumber(docs: readonly UploadedPartDoc[]): UploadedPartDoc[] {
  const latest = new Map<number, UploadedPartDoc>();
  for (const doc of docs) {
    const seen = latest.get(doc.partNumber);
    // uploadedAt is ISO-8601 UTC text, which compares chronologically.
    if (!seen || doc.uploadedAt >= seen.uploadedAt) {
      latest.set(doc.partNumber, doc);
    }
  }
  return [...latest.values()].sort((a, b) => a.partNumber - b.partNumber);
}

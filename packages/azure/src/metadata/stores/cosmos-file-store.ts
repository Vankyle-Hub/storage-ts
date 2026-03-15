import type { Container } from "@azure/cosmos";
import type {
  IFileStore,
  CreateFileInput,
  UpdateFileInput,
  CreateFileVersionInput,
} from "@vankyle-hub/storage-core";
import type { File, FileVersion } from "@vankyle-hub/storage-core";
import { FileStatus } from "@vankyle-hub/storage-core";
import {
  type FileDoc,
  type FileVersionDoc,
  fileDocToModel,
  fileVersionDocToModel,
} from "../mappers/file-doc.mapper.js";

export class CosmosFileStore implements IFileStore {
  constructor(private readonly container: Container) {}

  async createFile(input: CreateFileInput): Promise<File> {
    const now = new Date().toISOString();
    const doc: FileDoc = {
      id: input.id,
      pk: input.id,
      type: "file",
      ownerId: input.ownerId,
      displayName: input.displayName,
      mimeType: input.mimeType,
      size: input.size,
      parentId: input.parentId,
      status: FileStatus.Active,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    const { resource } = await this.container.items.create(doc);
    return fileDocToModel(resource as FileDoc);
  }

  async getFile(id: string): Promise<File | undefined> {
    try {
      // file pk = id
      const { resource } = await this.container.item(id, id).read<FileDoc>();
      if (!resource || resource.type !== "file") return undefined;
      return fileDocToModel(resource);
    } catch {
      return undefined;
    }
  }

  async updateFile(id: string, input: UpdateFileInput): Promise<File> {
    // file pk = id
    const { resource: existing } = await this.container.item(id, id).read<FileDoc>();
    if (!existing) {
      throw new Error(`File not found: ${id}`);
    }

    const updated: FileDoc = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };

    if (input.displayName !== undefined) updated.displayName = input.displayName;
    if (input.currentVersionId !== undefined)
      updated.currentVersionId = input.currentVersionId;
    if (input.size !== undefined) updated.size = input.size;
    if (input.mimeType !== undefined) updated.mimeType = input.mimeType;
    if (input.status !== undefined) updated.status = input.status;
    if (input.deletedAt !== undefined)
      updated.deletedAt = input.deletedAt.toISOString();
    if (input.metadata !== undefined) updated.metadata = input.metadata;

    // file pk = id
    const { resource } = await this.container.item(id, id).replace(updated);
    return fileDocToModel(resource as FileDoc);
  }

  async createVersion(input: CreateFileVersionInput): Promise<FileVersion> {
    const doc: FileVersionDoc = {
      id: input.id,
      pk: input.fileId,
      type: "file-version",
      fileId: input.fileId,
      blobId: input.blobId,
      version: input.version,
      size: input.size,
      mimeType: input.mimeType,
      sha256: input.sha256,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
      metadata: input.metadata,
    };

    const { resource } = await this.container.items.create(doc);
    return fileVersionDocToModel(resource as FileVersionDoc);
  }

  async getVersion(id: string): Promise<FileVersion | undefined> {
    // file-version pk = fileId, unknown here — use cross-partition query
    const query = {
      query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'file-version'",
      parameters: [{ name: "@id", value: id }],
    };

    const { resources } = await this.container.items
      .query<FileVersionDoc>(query)
      .fetchAll();
    if (resources.length === 0) return undefined;
    return fileVersionDocToModel(resources[0]!);
  }

  async listVersions(fileId: string): Promise<FileVersion[]> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'file-version' AND c.fileId = @fileId ORDER BY c.version",
      parameters: [{ name: "@fileId", value: fileId }],
    };

    // file-version pk = fileId — single-partition query
    const { resources } = await this.container.items
      .query<FileVersionDoc>(query, { partitionKey: fileId })
      .fetchAll();
    return resources.map(fileVersionDocToModel);
  }

  async getLatestVersion(fileId: string): Promise<FileVersion | undefined> {
    const query = {
      query:
        "SELECT TOP 1 * FROM c WHERE c.type = 'file-version' AND c.fileId = @fileId ORDER BY c.version DESC",
      parameters: [{ name: "@fileId", value: fileId }],
    };

    // file-version pk = fileId — single-partition query
    const { resources } = await this.container.items
      .query<FileVersionDoc>(query, { partitionKey: fileId })
      .fetchAll();
    if (resources.length === 0) return undefined;
    return fileVersionDocToModel(resources[0]!);
  }
}

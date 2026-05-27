import type { Container } from "@azure/cosmos";
import type {
  CreateFileTagInput,
  CreateTagInput,
  File,
  FileTag,
  ITagStore,
  Tag,
} from "@vankyle/storage-core";
import { normalizeTagName } from "@vankyle/storage-core";
import {
  type FileDoc,
  fileDocToModel,
} from "@/metadata/mappers/file-doc.mapper";
import {
  type FileTagDoc,
  type TagDoc,
  fileTagDocToModel,
  tagDocToModel,
} from "@/metadata/mappers/tag-doc.mapper";

export class CosmosTagStore implements ITagStore {
  constructor(private readonly container: Container) {}

  async createTag(input: CreateTagInput): Promise<Tag> {
    const normalizedName = input.normalizedName ?? normalizeTagName(input.name);
    const pk = userPk(input.ownerId);
    const now = new Date().toISOString();
    const doc: TagDoc = {
      id: input.id ?? tagId(input.ownerId, normalizedName),
      pk,
      type: "tag",
      ownerId: input.ownerId,
      name: input.name,
      normalizedName,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    try {
      const { resource } = await this.container.items.create(doc);
      return tagDocToModel(resource as TagDoc);
    } catch (error) {
      if (isConflict(error)) {
        const existing = await this.readTag(doc.id, pk);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const query = {
      query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'tag'",
      parameters: [{ name: "@id", value: id }],
    };
    const { resources } = await this.container.items.query<TagDoc>(query).fetchAll();
    const doc = resources[0];
    return doc ? tagDocToModel(doc) : undefined;
  }

  async getTagByName(ownerId: string, name: string): Promise<Tag | undefined> {
    const normalizedName = normalizeTagName(name);
    return this.readTag(tagId(ownerId, normalizedName), userPk(ownerId));
  }

  async listTags(ownerId: string): Promise<Tag[]> {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'tag' AND c.ownerId = @ownerId ORDER BY c.name",
      parameters: [{ name: "@ownerId", value: ownerId }],
    };
    const { resources } = await this.container.items
      .query<TagDoc>(query, { partitionKey: userPk(ownerId) })
      .fetchAll();
    return resources.map(tagDocToModel);
  }

  async deleteTag(id: string): Promise<void> {
    const tag = await this.getTag(id);
    if (!tag) return;
    const pk = userPk(tag.ownerId);
    const query = {
      query: "SELECT * FROM c WHERE c.type = 'file-tag' AND c.tagId = @tagId",
      parameters: [{ name: "@tagId", value: id }],
    };
    const { resources } = await this.container.items
      .query<FileTagDoc>(query, { partitionKey: pk })
      .fetchAll();

    for (const doc of resources) {
      await this.container.item(doc.id, pk).delete();
    }
    await this.container.item(id, pk).delete();
  }

  async addTagToFile(input: CreateFileTagInput): Promise<FileTag> {
    const pk = userPk(input.ownerId);
    const id = fileTagId(input.ownerId, input.fileId, input.tagId);
    const existing = await this.readFileTag(id, pk);
    if (existing) return existing;

    const doc: FileTagDoc = {
      id,
      pk,
      type: "file-tag",
      ownerId: input.ownerId,
      fileId: input.fileId,
      tagId: input.tagId,
      createdAt: new Date().toISOString(),
    };

    try {
      const { resource } = await this.container.items.create(doc);
      return fileTagDocToModel(resource as FileTagDoc);
    } catch (error) {
      if (isConflict(error)) {
        const conflict = await this.readFileTag(id, pk);
        if (conflict) return conflict;
      }
      throw error;
    }
  }

  async removeTagFromFile(
    ownerId: string,
    fileId: string,
    tagIdValue: string,
  ): Promise<void> {
    const pk = userPk(ownerId);
    const id = fileTagId(ownerId, fileId, tagIdValue);
    try {
      await this.container.item(id, pk).delete();
    } catch {
      // idempotent removal
    }
  }

  async listTagsForFile(ownerId: string, fileId: string): Promise<Tag[]> {
    const pk = userPk(ownerId);
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'file-tag' AND c.ownerId = @ownerId AND c.fileId = @fileId",
      parameters: [
        { name: "@ownerId", value: ownerId },
        { name: "@fileId", value: fileId },
      ],
    };
    const { resources } = await this.container.items
      .query<FileTagDoc>(query, { partitionKey: pk })
      .fetchAll();

    const tags = await Promise.all(
      resources.map((doc) => this.readTag(doc.tagId, pk)),
    );
    return tags.filter((tag): tag is Tag => tag !== undefined);
  }

  async listFilesByTag(ownerId: string, tagIdValue: string): Promise<File[]> {
    const pk = userPk(ownerId);
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'file-tag' AND c.ownerId = @ownerId AND c.tagId = @tagId",
      parameters: [
        { name: "@ownerId", value: ownerId },
        { name: "@tagId", value: tagIdValue },
      ],
    };
    const { resources } = await this.container.items
      .query<FileTagDoc>(query, { partitionKey: pk })
      .fetchAll();

    const files = await Promise.all(
      resources.map((doc) => this.readFile(doc.fileId)),
    );
    return files.filter((file): file is File => file !== undefined);
  }

  private async readTag(id: string, pk: string): Promise<Tag | undefined> {
    try {
      const { resource } = await this.container.item(id, pk).read<TagDoc>();
      if (!resource || resource.type !== "tag") return undefined;
      return tagDocToModel(resource);
    } catch {
      return undefined;
    }
  }

  private async readFileTag(
    id: string,
    pk: string,
  ): Promise<FileTag | undefined> {
    try {
      const { resource } = await this.container.item(id, pk).read<FileTagDoc>();
      if (!resource || resource.type !== "file-tag") return undefined;
      return fileTagDocToModel(resource);
    } catch {
      return undefined;
    }
  }

  private async readFile(id: string): Promise<File | undefined> {
    try {
      const { resource } = await this.container.item(id, id).read<FileDoc>();
      if (!resource || resource.type !== "file") return undefined;
      return fileDocToModel(resource);
    } catch {
      return undefined;
    }
  }
}

function userPk(ownerId: string): string {
  return `user:${ownerId}`;
}

function tagId(ownerId: string, normalizedName: string): string {
  return `tag:${encodeURIComponent(ownerId)}:${encodeURIComponent(normalizedName)}`;
}

function fileTagId(ownerId: string, fileId: string, tagIdValue: string): string {
  return [
    "file-tag",
    encodeURIComponent(ownerId),
    encodeURIComponent(fileId),
    encodeURIComponent(tagIdValue),
  ].join(":");
}

function isConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: number | string; statusCode?: number };
  return candidate.code === 409 ||
    candidate.code === "Conflict" ||
    candidate.statusCode === 409;
}

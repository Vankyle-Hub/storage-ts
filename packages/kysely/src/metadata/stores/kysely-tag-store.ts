import type { Kysely } from "kysely";
import type {
  CreateFileTagInput,
  CreateTagInput,
  File,
  FileTag,
  ITagStore,
  Tag,
} from "@vankyle/storage-core";
import { generateId, normalizeTagName } from "@vankyle/storage-core";
import type { StorageDatabase } from "@/schema/database";
import { fileRowToModel } from "@/mappers/file-row.mapper";
import { fileTagRowToModel, tagRowToModel } from "@/mappers/tag-row.mapper";

export class KyselyTagStore implements ITagStore {
  constructor(private readonly db: Kysely<StorageDatabase>) {}

  async createTag(input: CreateTagInput): Promise<Tag> {
    const now = new Date();
    const row = await this.db
      .insertInto("tags")
      .values({
        id: input.id ?? generateId(),
        owner_id: input.ownerId,
        name: input.name,
        normalized_name: input.normalizedName ?? normalizeTagName(input.name),
        created_at: now,
        updated_at: now,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return tagRowToModel(row);
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const row = await this.db
      .selectFrom("tags")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? tagRowToModel(row) : undefined;
  }

  async getTagByName(ownerId: string, name: string): Promise<Tag | undefined> {
    const row = await this.db
      .selectFrom("tags")
      .selectAll()
      .where("owner_id", "=", ownerId)
      .where("normalized_name", "=", normalizeTagName(name))
      .executeTakeFirst();

    return row ? tagRowToModel(row) : undefined;
  }

  async listTags(ownerId: string): Promise<Tag[]> {
    const rows = await this.db
      .selectFrom("tags")
      .selectAll()
      .where("owner_id", "=", ownerId)
      .orderBy("name", "asc")
      .execute();

    return rows.map(tagRowToModel);
  }

  async deleteTag(id: string): Promise<void> {
    await this.db.deleteFrom("file_tags").where("tag_id", "=", id).execute();
    await this.db.deleteFrom("tags").where("id", "=", id).execute();
  }

  async addTagToFile(input: CreateFileTagInput): Promise<FileTag> {
    const existing = await this.db
      .selectFrom("file_tags")
      .selectAll()
      .where("owner_id", "=", input.ownerId)
      .where("file_id", "=", input.fileId)
      .where("tag_id", "=", input.tagId)
      .executeTakeFirst();

    if (existing) return fileTagRowToModel(existing);

    const row = await this.db
      .insertInto("file_tags")
      .values({
        owner_id: input.ownerId,
        file_id: input.fileId,
        tag_id: input.tagId,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return fileTagRowToModel(row);
  }

  async removeTagFromFile(
    ownerId: string,
    fileId: string,
    tagId: string,
  ): Promise<void> {
    await this.db
      .deleteFrom("file_tags")
      .where("owner_id", "=", ownerId)
      .where("file_id", "=", fileId)
      .where("tag_id", "=", tagId)
      .execute();
  }

  async listTagsForFile(ownerId: string, fileId: string): Promise<Tag[]> {
    const rows = await this.db
      .selectFrom("tags")
      .innerJoin("file_tags", "file_tags.tag_id", "tags.id")
      .selectAll("tags")
      .where("file_tags.owner_id", "=", ownerId)
      .where("file_tags.file_id", "=", fileId)
      .orderBy("tags.name", "asc")
      .execute();

    return rows.map(tagRowToModel);
  }

  async listFilesByTag(ownerId: string, tagId: string): Promise<File[]> {
    const rows = await this.db
      .selectFrom("files")
      .innerJoin("file_tags", "file_tags.file_id", "files.id")
      .selectAll("files")
      .where("file_tags.owner_id", "=", ownerId)
      .where("file_tags.tag_id", "=", tagId)
      .where("files.owner_id", "=", ownerId)
      .execute();

    return rows.map(fileRowToModel);
  }
}

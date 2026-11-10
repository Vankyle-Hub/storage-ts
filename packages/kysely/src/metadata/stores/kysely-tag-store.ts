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
import { StoreDialect, type KyselyStoreOptions } from "@/metadata/store-dialect";

export class KyselyTagStore implements ITagStore {
  private readonly dialect: StoreDialect;

  constructor(
    private readonly db: Kysely<StorageDatabase>,
    options?: KyselyStoreOptions,
  ) {
    this.dialect = new StoreDialect(db, options);
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    await this.dialect.ensureReady(this.db);
    const now = this.dialect.timestamp(new Date());
    const row = await this.dialect.insertRow(this.db, "tags", {
      id: input.id ?? generateId(),
      owner_id: input.ownerId,
      name: input.name,
      normalized_name: input.normalizedName ?? normalizeTagName(input.name),
      created_at: now,
      updated_at: now,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    return tagRowToModel(row);
  }

  async getTag(id: string): Promise<Tag | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("tags")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? tagRowToModel(row) : undefined;
  }

  async getTagByName(ownerId: string, name: string): Promise<Tag | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("tags")
      .selectAll()
      .where("owner_id", "=", ownerId)
      .where("normalized_name", "=", normalizeTagName(name))
      .executeTakeFirst();

    return row ? tagRowToModel(row) : undefined;
  }

  async listTags(ownerId: string): Promise<Tag[]> {
    await this.dialect.ensureReady(this.db);
    const rows = await this.db
      .selectFrom("tags")
      .selectAll()
      .where("owner_id", "=", ownerId)
      .orderBy("name", "asc")
      .execute();

    return rows.map(tagRowToModel);
  }

  async deleteTag(id: string): Promise<void> {
    await this.dialect.ensureReady(this.db);
    await this.db.deleteFrom("file_tags").where("tag_id", "=", id).execute();
    await this.db.deleteFrom("tags").where("id", "=", id).execute();
  }

  async addTagToFile(input: CreateFileTagInput): Promise<FileTag> {
    await this.dialect.ensureReady(this.db);
    const existing = await this.findFileTag(input);
    if (existing) return existing;

    // file_tags has no id column, so the row is read back by its natural key
    // rather than through StoreDialect.insertRow. This also avoids RETURNING,
    // which MySQL does not support.
    await this.db
      .insertInto("file_tags")
      .values({
        owner_id: input.ownerId,
        file_id: input.fileId,
        tag_id: input.tagId,
        created_at: this.dialect.timestamp(new Date()),
      })
      .execute();

    const created = await this.findFileTag(input);
    if (!created) {
      throw new Error(
        `file_tags row not found after insert: ${input.fileId}/${input.tagId}`,
      );
    }
    return created;
  }

  async removeTagFromFile(
    ownerId: string,
    fileId: string,
    tagId: string,
  ): Promise<void> {
    await this.dialect.ensureReady(this.db);
    await this.db
      .deleteFrom("file_tags")
      .where("owner_id", "=", ownerId)
      .where("file_id", "=", fileId)
      .where("tag_id", "=", tagId)
      .execute();
  }

  async listTagsForFile(ownerId: string, fileId: string): Promise<Tag[]> {
    await this.dialect.ensureReady(this.db);
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
    await this.dialect.ensureReady(this.db);
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

  private async findFileTag(
    input: CreateFileTagInput,
  ): Promise<FileTag | undefined> {
    const row = await this.db
      .selectFrom("file_tags")
      .selectAll()
      .where("owner_id", "=", input.ownerId)
      .where("file_id", "=", input.fileId)
      .where("tag_id", "=", input.tagId)
      .executeTakeFirst();

    return row ? fileTagRowToModel(row) : undefined;
  }
}

import type { JsonObject } from "@vankyle/storage-shared";
import type { File } from "@/domain/models/file";
import type { FileTag } from "@/domain/models/file-tag";
import type { Tag } from "@/domain/models/tag";

export interface CreateTagInput {
  readonly id?: string | undefined;
  readonly ownerId: string;
  readonly name: string;
  readonly normalizedName?: string | undefined;
  readonly metadata?: JsonObject | undefined;
}

export interface CreateFileTagInput {
  readonly ownerId: string;
  readonly fileId: string;
  readonly tagId: string;
}

export interface ITagStore {
  createTag(input: CreateTagInput): Promise<Tag>;
  getTag(id: string): Promise<Tag | undefined>;
  getTagByName(ownerId: string, name: string): Promise<Tag | undefined>;
  listTags(ownerId: string): Promise<Tag[]>;
  deleteTag(id: string): Promise<void>;

  addTagToFile(input: CreateFileTagInput): Promise<FileTag>;
  removeTagFromFile(ownerId: string, fileId: string, tagId: string): Promise<void>;
  listTagsForFile(ownerId: string, fileId: string): Promise<Tag[]>;
  listFilesByTag(ownerId: string, tagId: string): Promise<File[]>;
}

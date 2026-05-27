import type { JsonObject } from "@vankyle/storage-shared";
import type { FileTag, Tag } from "@vankyle/storage-core";

export interface TagDoc {
  id: string;
  pk: string;
  type: "tag";
  ownerId: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  metadata?: JsonObject | undefined;
}

export interface FileTagDoc {
  id: string;
  pk: string;
  type: "file-tag";
  ownerId: string;
  fileId: string;
  tagId: string;
  createdAt: string;
}

export function tagDocToModel(doc: TagDoc): Tag {
  return {
    id: doc.id,
    ownerId: doc.ownerId,
    name: doc.name,
    normalizedName: doc.normalizedName,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
    metadata: doc.metadata,
  };
}

export function fileTagDocToModel(doc: FileTagDoc): FileTag {
  return {
    ownerId: doc.ownerId,
    fileId: doc.fileId,
    tagId: doc.tagId,
    createdAt: new Date(doc.createdAt),
  };
}

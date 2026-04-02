import type { IUploadSessionStore } from "@/ports/metadata/i-upload-session-store";
import type { IBlobStore } from "@/ports/metadata/i-blob-store";
import type { IFileStore } from "@/ports/metadata/i-file-store";

export interface IMetadataStore {
  readonly uploads: IUploadSessionStore;
  readonly blobs: IBlobStore;
  readonly files: IFileStore;
}

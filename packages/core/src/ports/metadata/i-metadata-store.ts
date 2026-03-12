import type { IUploadSessionStore } from "./i-upload-session-store.js";
import type { IBlobStore } from "./i-blob-store.js";
import type { IFileStore } from "./i-file-store.js";

export interface IMetadataStore {
  readonly uploads: IUploadSessionStore;
  readonly blobs: IBlobStore;
  readonly files: IFileStore;
}

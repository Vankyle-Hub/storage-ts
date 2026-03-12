import type { Kysely } from "kysely";
import type { IMetadataStore } from "@vankyle-hub/storage-core";
import type { StorageDatabase } from "../schema/database.js";
import { KyselyUploadSessionStore } from "./stores/kysely-upload-session-store.js";
import { KyselyBlobStore } from "./stores/kysely-blob-store.js";
import { KyselyFileStore } from "./stores/kysely-file-store.js";

export class KyselyMetadataStore implements IMetadataStore {
  readonly uploads: KyselyUploadSessionStore;
  readonly blobs: KyselyBlobStore;
  readonly files: KyselyFileStore;

  constructor(db: Kysely<StorageDatabase>) {
    this.uploads = new KyselyUploadSessionStore(db);
    this.blobs = new KyselyBlobStore(db);
    this.files = new KyselyFileStore(db);
  }
}

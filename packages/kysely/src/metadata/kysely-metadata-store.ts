import type { Kysely } from "kysely";
import type { IMetadataStore } from "@vankyle/storage-core";
import type { StorageDatabase } from "@/schema/database";
import { KyselyUploadSessionStore } from "@/metadata/stores/kysely-upload-session-store";
import { KyselyBlobStore } from "@/metadata/stores/kysely-blob-store";
import { KyselyFileStore } from "@/metadata/stores/kysely-file-store";

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

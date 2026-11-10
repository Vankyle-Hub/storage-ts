import type { Kysely } from "kysely";
import type { IMetadataStore } from "@vankyle/storage-core";
import type { StorageDatabase } from "@/schema/database";
import { KyselyUploadSessionStore } from "@/metadata/stores/kysely-upload-session-store";
import { KyselyBlobStore } from "@/metadata/stores/kysely-blob-store";
import { KyselyFileStore } from "@/metadata/stores/kysely-file-store";
import { detectDatabaseType, type KyselyStoreOptions } from "@/metadata/store-dialect";
import type { DatabaseType } from "@/migrations/types";

export class KyselyMetadataStore implements IMetadataStore {
  readonly uploads: KyselyUploadSessionStore;
  readonly blobs: KyselyBlobStore;
  readonly files: KyselyFileStore;
  /** The database type in effect — given in `options`, or detected. */
  readonly databaseType: DatabaseType;

  /**
   * @param options `databaseType` is detected from the Kysely dialect when
   *   omitted; see {@link KyselyStoreOptions}.
   */
  constructor(db: Kysely<StorageDatabase>, options?: KyselyStoreOptions) {
    this.databaseType = options?.databaseType ?? detectDatabaseType(db);
    const resolved: KyselyStoreOptions = { databaseType: this.databaseType };
    this.uploads = new KyselyUploadSessionStore(db, resolved);
    this.blobs = new KyselyBlobStore(db, resolved);
    this.files = new KyselyFileStore(db, resolved);
  }
}

import { CosmosClient, type Container } from "@azure/cosmos";
import type { IMetadataStore } from "@vankyle/storage-core";
import type { CosmosMetadataOptions } from "@/types/cosmos-options";
import { CosmosUploadSessionStore } from "@/metadata/stores/cosmos-upload-session-store";
import { CosmosBlobStore } from "@/metadata/stores/cosmos-blob-store";
import { CosmosFileStore } from "@/metadata/stores/cosmos-file-store";

const DEFAULT_CONTAINER_ID = "storage";

export class CosmosMetadataStore implements IMetadataStore {
  readonly uploads: CosmosUploadSessionStore;
  readonly blobs: CosmosBlobStore;
  readonly files: CosmosFileStore;

  constructor(container: Container);
  constructor(options: CosmosMetadataOptions);
  constructor(
    containerOrOptions: Container | CosmosMetadataOptions,
  ) {
    let container: Container;

    if ("items" in containerOrOptions) {
      container = containerOrOptions as Container;
    } else {
      const options = containerOrOptions;
      let client: CosmosClient;

      if (options.connectionString) {
        client = new CosmosClient(options.connectionString);
      } else if (options.endpoint && options.key) {
        client = new CosmosClient({
          endpoint: options.endpoint,
          key: options.key,
        });
      } else {
        throw new Error(
          "CosmosMetadataStore requires connectionString or endpoint+key",
        );
      }

      container = client
        .database(options.databaseId)
        .container(options.containerId ?? DEFAULT_CONTAINER_ID);
    }

    this.uploads = new CosmosUploadSessionStore(container);
    this.blobs = new CosmosBlobStore(container);
    this.files = new CosmosFileStore(container);
  }
}

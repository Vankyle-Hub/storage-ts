import { CosmosClient, type Container } from "@azure/cosmos";
import type { IMetadataStore } from "@vankyle-hub/storage-core";
import type { CosmosMetadataOptions } from "../types/cosmos-options.js";
import { CosmosUploadSessionStore } from "./stores/cosmos-upload-session-store.js";
import { CosmosBlobStore } from "./stores/cosmos-blob-store.js";
import { CosmosFileStore } from "./stores/cosmos-file-store.js";

const DEFAULT_CONTAINER_ID = "storage";

export class CosmosMetadataStore implements IMetadataStore {
  readonly uploads: CosmosUploadSessionStore;
  readonly blobs: CosmosBlobStore;
  readonly files: CosmosFileStore;

  constructor(container: Container);
  constructor(options: CosmosMetadataOptions, containerId?: string);
  constructor(
    containerOrOptions: Container | CosmosMetadataOptions,
    containerId?: string,
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
        .container(containerId ?? DEFAULT_CONTAINER_ID);
    }

    this.uploads = new CosmosUploadSessionStore(container);
    this.blobs = new CosmosBlobStore(container);
    this.files = new CosmosFileStore(container);
  }
}

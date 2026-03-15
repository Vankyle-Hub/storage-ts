export interface CosmosMetadataOptions {
  readonly connectionString?: string | undefined;
  readonly endpoint?: string | undefined;
  readonly key?: string | undefined;
  readonly databaseId: string;
  /**
   * Container ID — defaults to `"storage"`.
   *
   * The container **must** be created with partition key path `/pk`.
   */
  readonly containerId?: string | undefined;
}

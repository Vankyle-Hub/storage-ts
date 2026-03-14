import { describe, it, expect } from "vitest";
import { AzureBlobStorage } from "./azure-blob-storage.js";

describe("AzureBlobStorage", () => {
  describe("createPutUrl", () => {
    it("should generate a SAS URL with racw permissions", async () => {
      const storage = new AzureBlobStorage({
        accountName: "testaccount",
        accountKey: "testkey1234567890=", // dummy base64
        defaultSasExpiresInSeconds: 3600,
      });

      const url = await storage.createPutUrl({
        bucket: "test-container",
        objectKey: "test-object.txt",
      });

      expect(url.method).toBe("PUT");
      expect(url.url).toContain("sp=racw");
      expect(url.url).toContain("sig=");
    });
  });
});

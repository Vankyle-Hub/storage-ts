import { describe, expect, it } from "vitest";
import { S3Storage } from "@/storage/s3-storage";

function createStorage(): S3Storage {
  return new S3Storage({
    clientConfig: {
      region: "us-east-1",
      endpoint: "https://s3.example.test",
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
    },
    forcePathStyle: true,
  });
}

describe("S3Storage", () => {
  describe("createReadUrl", () => {
    it("should include response header overrides in the presigned URL", async () => {
      const storage = createStorage();

      const signed = await storage.createReadUrl({
        bucket: "test-bucket",
        objectKey: "path/to/demo.txt",
        expiresInSeconds: 600,
        responseContentDisposition:
          "attachment; filename=\"demo.txt\"; filename*=UTF-8''demo.txt",
        responseContentType: "text/plain",
      });

      const params = new URL(signed.url).searchParams;
      expect(params.get("response-content-disposition")).toBe(
        "attachment; filename=\"demo.txt\"; filename*=UTF-8''demo.txt",
      );
      expect(params.get("response-content-type")).toBe("text/plain");
    });

    it("should omit response header override query params when not provided", async () => {
      const storage = createStorage();

      const signed = await storage.createReadUrl({
        bucket: "test-bucket",
        objectKey: "path/to/demo.txt",
        expiresInSeconds: 600,
      });

      const params = new URL(signed.url).searchParams;
      expect(params.has("response-content-disposition")).toBe(false);
      expect(params.has("response-content-type")).toBe(false);
    });
  });
});

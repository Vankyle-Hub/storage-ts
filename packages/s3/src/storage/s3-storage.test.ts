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

/** The header names covered by the signature of a presigned URL. */
function signedHeaders(url: string): string[] {
  return (new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
}

describe("S3Storage", () => {
  it("declares that presigned upload URLs enforce the content length", () => {
    expect(createStorage().capabilities.signedContentLength).toBe(true);
  });

  describe("createPutUrl", () => {
    it("signs content-length when a contentLength is given", async () => {
      const signed = await createStorage().createPutUrl({
        bucket: "test-bucket",
        objectKey: "path/to/demo.txt",
        contentType: "text/plain",
        contentLength: 1024,
      });

      expect(signed.method).toBe("PUT");
      expect(signedHeaders(signed.url)).toContain("content-length");
    });

    it("signs a content-length of zero", async () => {
      const signed = await createStorage().createPutUrl({
        bucket: "test-bucket",
        objectKey: "path/to/empty.txt",
        contentLength: 0,
      });

      expect(signedHeaders(signed.url)).toContain("content-length");
    });

    it("produces different signatures for different sizes", async () => {
      const storage = createStorage();
      const input = { bucket: "test-bucket", objectKey: "path/to/demo.txt" };

      const a = new URL((await storage.createPutUrl({ ...input, contentLength: 1 })).url);
      const b = new URL((await storage.createPutUrl({ ...input, contentLength: 2 })).url);

      // Only meaningful if both were signed at the same instant.
      if (a.searchParams.get("X-Amz-Date") === b.searchParams.get("X-Amz-Date")) {
        expect(a.searchParams.get("X-Amz-Signature")).not.toBe(
          b.searchParams.get("X-Amz-Signature"),
        );
      }
    });

    it("leaves the size unconstrained without a contentLength", async () => {
      const signed = await createStorage().createPutUrl({
        bucket: "test-bucket",
        objectKey: "path/to/demo.txt",
        contentType: "text/plain",
      });

      expect(signedHeaders(signed.url)).not.toContain("content-length");
    });
  });

  describe("createUploadPartUrl", () => {
    const part = {
      bucket: "test-bucket",
      objectKey: "path/to/big.bin",
      providerUploadId: "upload-1",
      partNumber: 3,
    };

    it("signs content-length when a contentLength is given", async () => {
      const signed = await createStorage().createUploadPartUrl({
        ...part,
        contentLength: 5 * 1024 * 1024,
      });

      const params = new URL(signed.url).searchParams;
      expect(signedHeaders(signed.url)).toContain("content-length");
      expect(params.get("partNumber")).toBe("3");
      expect(params.get("uploadId")).toBe("upload-1");
    });

    it("leaves the size unconstrained without a contentLength", async () => {
      const signed = await createStorage().createUploadPartUrl(part);

      expect(signedHeaders(signed.url)).not.toContain("content-length");
    });
  });

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

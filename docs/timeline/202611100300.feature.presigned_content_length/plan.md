# Plan

1. `core` port types: `contentLength` on `CreatePutUrlInput` / `CreateUploadPartUrlInput`, `signedContentLength` on `StorageCapabilities`.
2. `core` service: forward `expectedSize` (single) and `request.contentLength` (part); validate both as non-negative safe integers.
3. `s3`: pass `ContentLength` to `PutObjectCommand` / `UploadPartCommand` when presigning; set the capability.
4. Tests: service forwarding and validation; S3 signed headers.
5. End-to-end against MinIO in a throwaway Docker container (script kept outside the repository).
6. Docs and changelog.

Pitfalls:

- The presigner only signs headers that are present on the request it builds; verify with a test that `content-length` actually lands in `X-Amz-SignedHeaders`, rather than trusting the SDK's behavior across versions.
- `contentLength: 0` is a valid size and must be forwarded, so test for `undefined`, not truthiness.

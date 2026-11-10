# Notes

Outcome: completed. Presigned PUT and part URLs from `S3Storage` are bound to the declared size; the service forwards `expectedSize` (single mode) and a per-part `contentLength`.

## Decisions

- **Exact size, through the signature.** With `ContentLength` set on the command, the presigner adds `content-length` to `X-Amz-SignedHeaders`. Confirmed by inspecting the generated URLs rather than assumed, and pinned by tests, because it depends on SDK behavior.
- **A capability flag, `signedContentLength`.** `contentLength` is silently ignored by providers that cannot enforce it, so an application needs a way to know whether the URL it hands out is really size-bound.
- **Part size comes from the caller.** The service cannot know how a file is split, so `getUploadPartUrl` takes `contentLength` and does not derive anything from `expectedSize`.
- **Validation of `expectedSize` / `contentLength`.** They now reach a signature, so a negative or fractional value is refused with `ValidationError` up front. For `expectedSize` this is new behavior at `createUploadSession` (listed as breaking).
- **No sum-of-parts check before completing** — dropped from the original proposal. Registered part sizes are client-declared, and the server-proxied path records `0` when a provider reports no size (`R2BindingStorage` with a stream of unknown length), so the comparison could reject a correct upload. The head check after completion stays the authority.

## Observations (not changed here)

- **`Content-Type` is not signed.** `createPutUrl` passes `ContentType`, but the presigner hoists it out of the signed headers (`X-Amz-SignedHeaders` is `host` only). A client can therefore upload with any content type; the blob's `mimeType` comes from the session, not from the object.
- **The presigned URLs carry `x-amz-checksum-crc32` and `x-amz-sdk-checksum-algorithm` query parameters**, added by the SDK's default checksum behavior. MinIO accepted uploads with them. Not checked against AWS S3 or R2.

## Verification

- `pnpm build`, `pnpm typecheck`, `pnpm exec vitest run` (20 files, 251 tests).
- End to end against MinIO `RELEASE.2025-09-07T16-13-09Z` in a throwaway Docker container, with a script kept outside the repository. Single PUT declared 5 bytes: 5 sent → 200; 4, 6 and 5,000,000 sent → `403 SignatureDoesNotMatch`, stored object unchanged. Declared 0: 0 sent → 200, 1 sent → 403. Undeclared → any size accepted. Multipart part declared 9: 8 sent → 403, 9 sent → 200, and the upload completed to a 9-byte object.
- Not verified: AWS S3 and Cloudflare R2 themselves.

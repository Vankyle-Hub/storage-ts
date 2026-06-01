# Changelog

## 0.4.1

- Removed the `node:crypto` dependency from `@vankyle/storage-core` ID
  generation. `generateId()` now uses the Web Crypto API via
  `globalThis.crypto.randomUUID()` with a `getRandomValues()` UUID v4 fallback.
- This fixes browser/Cloudflare Workers bundling for packages that depend on
  `@vankyle/storage-core`, including `@vankyle/storage-s3`, without requiring
  Node.js polyfills for this SDK code path.

## 0.4.0

- `getReadUrl` now accepts optional `responseContentDisposition` and
  `responseContentType`. When supplied, the S3 adapter bakes them into the
  presigned URL via S3's `response-content-disposition` /
  `response-content-type` query parameters, so the eventual GET response
  carries those headers without a backend proxy hop.
- Follow-up context for v2 backend handoff:
  `docs/refactors/v2/backend/route-completion/b2-storage/discussion.md`
  2026-05-24 (b) "Follow-up: vankyle upstream improvement".

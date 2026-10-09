# File Tags — Intent, Design, Spec, and Plan

Status: implementation in progress. Core service, Kysely adapter, and Cosmos adapter landed (superseded draft PR #28); correctness fixes, adapter contract tests, and documentation pending.
Tracking: GitHub issue #37.

This document is the single source of truth for the user-scoped file tags feature. Section 1 (Intent) and Section 2 (Design) state intent and structure; Section 3 (Spec) is the binding contract, including the acceptance criteria; Section 4 (Plan) is the remaining implementation path.

---

## 1. Intent

### 1.1 Problem

Applications building user-space file systems on this library need to organize files beyond folder-like paths: end users want to attach their own labels (tags) to their own files and later list files by tag. The library offers no tagging capability in the domain model, metadata ports, or storage service, so every host application bolts on a parallel tagging store — duplicating ownership checks and splitting file metadata across two systems.

### 1.2 Goal

Let each user (owner) create their own tags, attach them to files they own, and reverse-lookup files by tag:

- Tags are **user-scoped**: uniqueness is `(ownerId, normalizedName)`, never global; two owners may hold identically named tags without interaction.
- All file-scoped tag operations verify file ownership and fail with `MetadataNotFoundError` on foreign files (no existence leakage across users).
- Tag operations are **idempotent** where repetition is natural: creating an existing tag returns it; re-adding an existing association is a no-op; removing a missing association or deleting a missing tag succeeds silently.

### 1.3 Scope boundaries

**In scope (v1):**

- Tag lifecycle: create (idempotent), list per owner, delete (idempotent, cascading associations).
- File/tag associations: add (get-or-create), remove (idempotent), list a file's tags, list files by tag.
- Metadata adapters: Kysely (migration `0002_add_tags`, postgres + sqlite/D1 flavors) and Cosmos DB.
- Filtering of soft-deleted files from all tag-based listings.

**Explicitly out of scope (v1):**

- **Global or shared tags**, tag hierarchies, tag visibility/sharing models.
- **Tag rename/update API.** Names are immutable identity; renames are delete + create.
- **Tag length validation inside the SDK.** The 128-character column width is a database artifact; rejecting over-length input is the host API's DTO-validation job (§2.2).
- **Hard-delete cascade.** `deleteFile` is a soft delete; no hard-delete path exists, so no cascade is required (§2.5). A future hard-delete capability must add association cleanup as part of its own contract.

---

## 2. Design

### 2.1 Domain models

```typescript
interface Tag {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;            // as entered by the user (display form)
  readonly normalizedName: string;  // normalizeTagName(name); uniqueness key
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata?: JsonObject;   // host-defined payload, opaque to the library
}

interface FileTag {
  readonly fileId: string;
  readonly tagId: string;
  readonly ownerId: string;         // denormalized; enables owner-scoped reverse queries
  readonly createdAt: Date;
}
```

`FileTag` has no independent id; identity is the `(fileId, tagId)` pair.

### 2.2 Naming, normalization, and validation boundaries

- `normalizeTagName(name)` = `trim().toLowerCase()`. `"  Foo "` and `"foo"` are the same tag.
- **Domain invariant, enforced by the service layer:** a name that normalizes to the empty string is rejected with `ValidationError`. An empty `normalizedName` would corrupt the `(ownerId, normalizedName)` uniqueness key and silently break idempotency; this is a domain invariant of the SDK itself, not a storage artifact. Empty `ownerId`/`name` are rejected on the same grounds.
- **Length is NOT validated by the SDK.** The 128-character limit exists because the Kysely migration declares `varchar(128)`. Per fail-fast principles, an over-length tag is a *host API DTO* defect and must be rejected at the host's request boundary; if DTO validation is broken, the database error surfacing is the correct behavior — it exposes the true source of the defect. This limit is documented (here and in schema/port doc-comments) so hosts can write their DTO rules; the SDK deliberately does not duplicate the check.

### 2.3 Port composition

`ITagStore` is a sibling of the existing stores, composed into `IMetadataStore` as `readonly tags: ITagStore`. Both metadata adapters (Kysely, Cosmos) implement it; object-storage-only packages (`s3`, `cloudflare`) are untouched — Cloudflare deployments get tags through `D1Dialect` + `KyselyMetadataStore`.

### 2.4 Service orchestration

`DefaultStorageService` implements six operations on top of `ITagStore`:

- `createTag` is idempotent: `getTagByName` first, create on miss.
- `addTagToFile` reuses `createTag` for get-or-create semantics, then creates the association.
- Ownership is enforced by `requireOwnedFile()` before any file-scoped operation.
- `deleteTag` (exposed at service level) cascades: the store deletes all associations of the tag, then the tag itself.

### 2.5 Deletion semantics

`deleteFile` is a **soft delete** (`status = deleted` + `deletedAt`); the file row continues to exist, so tag associations on a deleted file are not orphans and no cascade is performed. The required behavior is **query filtering**: `listFilesByTag` and `listFileTags` must exclude files with `status = deleted`, because soft deletion is the primary deletion mode in real deployments.

Recorded constraint: if a hard-delete capability is introduced later, its contract must include `file_tags` cleanup.

### 2.6 Persistence

**Kysely — migration `0002_add_tags`:**

- `tags(id PK, owner_id, name varchar(128), normalized_name varchar(128), created_at, updated_at, metadata text)`
- `file_tags(file_id, tag_id, owner_id, created_at)` — no surrogate PK, no FK constraints (ownership of integrity sits in the service layer).
- Indexes: unique `(owner_id, normalized_name)` on tags; unique `(file_id, tag_id)` on file_tags; non-unique `(owner_id)`, `(owner_id, tag_id)`, `(owner_id, file_id)`.

**Cosmos DB:** single container, multi-type documents (`type: "tag" | "file-tag"`), partition key `user:{ownerId}`. Tag document ids are deterministic (`tag:{ownerId}:{normalizedName}`); a 409 conflict on create is resolved by reading the existing document back, yielding idempotency without a pre-read. `listFilesByTag` reads file documents across partitions by id.

### 2.7 Decision records

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Soft delete only ⇒ query filtering, no cascade | `deleteFile` never removes rows, so associations on deleted files are not orphans; filtering is the correct and sufficient behavior. |
| D2 | `deleteTag` is idempotent-silent | Deleting a missing tag succeeds silently, consistent with `removeTagFromFile`'s established idempotent style. |
| D3 | Length validation belongs to host API DTOs, not the SDK | Fail-fast: the 128 limit originates from the DB column width; if it is exceeded, the DB error must surface to expose the DTO defect at its true source. The SDK rejects only what corrupts its own domain invariants (empty normalized name, empty ownerId). |

---

## 3. Spec

Binding contracts. Types are TypeScript; error conditions are normative. Unless stated otherwise, everything below lives in `@vankyle/storage-core`.

### 3.1 Types

```typescript
// Domain models: see §2.1.

export type CreateTagRequest = { ownerId: string; name: string; metadata?: JsonObject };
export type DeleteTagRequest = { ownerId: string; tagName: string };
export type AddTagToFileRequest = { ownerId: string; fileId: string; tagName: string; metadata?: JsonObject };
export type RemoveTagFromFileRequest = { ownerId: string; fileId: string; tagName: string };
export type ListFileTagsRequest = { ownerId: string; fileId: string };
export type ListFilesByTagRequest = { ownerId: string; tagName: string };
```

### 3.2 ITagStore port

```typescript
interface ITagStore {
  createTag(input: { ownerId: string; name: string; normalizedName: string; metadata?: JsonObject }): Promise<Tag>;
  getTag(id: string): Promise<Tag | undefined>;
  getTagByName(ownerId: string, normalizedName: string): Promise<Tag | undefined>;
  listTags(ownerId: string): Promise<Tag[]>;                       // sorted by name
  deleteTag(id: string): Promise<void>;                            // cascades associations
  addTagToFile(input: { fileId: string; tagId: string; ownerId: string }): Promise<void>;   // idempotent
  removeTagFromFile(fileId: string, tagId: string): Promise<void>;                          // idempotent
  listTagsForFile(fileId: string): Promise<Tag[]>;
  listFilesByTag(ownerId: string, tagId: string): Promise<string[]>;                        // file ids
}
```

### 3.3 IStorageService additions

```typescript
interface IStorageService {
  // ...existing members unchanged...
  createTag(request: CreateTagRequest): Promise<Tag>;          // idempotent
  listTags(ownerId: string): Promise<Tag[]>;
  deleteTag(request: DeleteTagRequest): Promise<void>;         // idempotent, cascades
  addTagToFile(request: AddTagToFileRequest): Promise<Tag>;    // get-or-create
  removeTagFromFile(request: RemoveTagFromFileRequest): Promise<void>;  // idempotent
  listFileTags(request: ListFileTagsRequest): Promise<Tag[]>;
  listFilesByTag(request: ListFilesByTagRequest): Promise<File[]>;      // excludes soft-deleted files
}
```

### 3.4 Behavior contracts

- `createTag`: on a normalized-name hit for the same owner, returns the existing tag unchanged (including its original `metadata`); never duplicates.
- `listTags`: returns only the caller's tags, sorted by name; `[]` when none.
- `deleteTag`: resolves by `(ownerId, tagName)`; silently succeeds when the tag does not exist; cascades to all associations of the tag; never touches files.
- `addTagToFile`: verifies ownership first (`MetadataNotFoundError` for missing or foreign files); creates the tag when absent; re-adding an existing association is a silent no-op; returns the tag.
- `removeTagFromFile`: verifies ownership; silently succeeds when the tag or association does not exist; removes only the specified association.
- `listFileTags`: verifies ownership; returns the file's tags; `[]` when none.
- `listFilesByTag`: unknown tag ⇒ `[]`; results contain only the caller's files and **exclude soft-deleted files**.
- Tag `metadata` round-trips verbatim.

### 3.5 Error contract summary

| Condition | Error |
| --- | --- |
| Empty/blank `name` (normalizes to `""`), empty `ownerId` | `ValidationError` (service layer, domain invariant) |
| Over-length name (> 128 chars) | none from the SDK — host DTO's job; DB error surfaces otherwise (§2.2, D3) |
| File-scoped operation on missing or foreign-owned file | `MetadataNotFoundError` |
| Removing a missing tag/association; deleting a missing tag | none — idempotent silent success |
| `(ownerId, normalizedName)` unique-conflict at the store | none — adapter resolves to the existing tag |
| Underlying store failure | `MetadataError` |

### 3.6 Acceptance criteria

Each criterion is independently verifiable. Status legend: ✅ implemented & tested · 🔶 implemented, untested · ❌ not implemented.

**A. Tag lifecycle**

| ID | Criterion | Status |
| --- | --- | --- |
| A1 | `createTag` persists `ownerId/name/normalizedName/createdAt/updatedAt` and optional `metadata` | ✅ |
| A2 | `createTag` is idempotent on normalized name per owner — returns existing, no duplicate, no error | ✅ |
| A3 | `listTags` returns the owner's tags sorted by name; `[]` when none | 🔶 (sort untested) |
| A4 | Different owners may hold same-named tags with zero interaction | ❌ untested |
| A5 | Tag `metadata` round-trips verbatim | ❌ untested |

**B. Naming and validation**

| ID | Criterion | Status |
| --- | --- | --- |
| B1 | `normalizeTagName` = `trim().toLowerCase()`; `"  Foo "` ≡ `"foo"` | ✅ |
| B2 | Blank name normalizing to `""` is rejected with `ValidationError` at the service layer | ❌ not implemented |
| B3 | SDK performs no length validation; the 128 limit is documented for host DTOs | ❌ doc-comments pending |
| B4 | Empty `ownerId`/`name` rejected with `ValidationError` at the service layer | ❌ not implemented |

**C. File/tag association**

| ID | Criterion | Status |
| --- | --- | --- |
| C1 | `addTagToFile` verifies ownership, get-or-creates the tag, associates, returns the `Tag` | ✅ |
| C2 | Re-adding an existing association is a silent no-op (no duplicate row, no error) | 🔶 |
| C3 | `removeTagFromFile` is idempotent (missing tag or association ⇒ silent success) | ✅ |
| C4 | Removal affects only the specified association (other tags on the file, other files with the tag untouched) | ❌ untested |
| C5 | `listFileTags` returns the file's tags; `[]` when none | ✅ |
| C6 | File-scoped operations on a missing file throw `MetadataNotFoundError` | 🔶 |

**D. Reverse lookup**

| ID | Criterion | Status |
| --- | --- | --- |
| D1 | `listFilesByTag` returns the owner's tagged files; unknown tag ⇒ `[]` | ✅ |
| D2 | `listFilesByTag` and `listFileTags` exclude soft-deleted files | ❌ not implemented |
| D3 | Reverse lookup never crosses owners, even for same-named tags | ❌ untested |

**E. User isolation**

| ID | Criterion | Status |
| --- | --- | --- |
| E1 | File-scoped tag operations on a foreign file throw `MetadataNotFoundError` (no existence leakage) | ✅ |
| E2 | `listTags` returns only the caller's tags | ❌ untested |
| E3 | `listFilesByTag` ignores other owners' same-named tags | ❌ untested |

**F. Deletion semantics**

| ID | Criterion | Status |
| --- | --- | --- |
| F1 | (withdrawn — soft delete only; see §2.5/D1) | — |
| F2 | Service-level `deleteTag` cascades associations and is idempotent-silent on missing tags | ❌ port/adapters implemented, service exposure missing |
| F3 | Deleting a tag never touches files; soft-deleting a file never touches tags | ❌ untested |

**G. Adapter contract (Kysely + Cosmos behave identically)**

| ID | Criterion | Status |
| --- | --- | --- |
| G1 | Shared `ITagStore` contract test suite passes against both adapters (all 9 methods) | ❌ both untested |
| G2 | Kysely `createTag` resolves unique conflicts to the existing tag (no DB error escapes) | ❌ untested |
| G3 | Cosmos `createTag` resolves 409 conflicts by reading back the existing document | ❌ untested |
| G4 | Both adapters' `deleteTag` delete associations before the tag | 🔶 implemented, untested |
| G5 | Migration `0002` creates both tables and all indexes for postgres + sqlite flavors and is rollback-complete | 🔶 DDL assertions only |

**H. Engineering and integration**

| ID | Criterion | Status |
| --- | --- | --- |
| H1 | All new public API is exported from each package entry point | ✅ |
| H2 | `pnpm typecheck` and `pnpm exec vitest run` green | ✅ |
| H3 | Cloudflare gains tags via `D1Dialect` + `KyselyMetadataStore` with no code change | 🔶 unverified |
| H4 | Error model consistency: foreign/missing file ⇒ `MetadataNotFoundError`; invalid input ⇒ `ValidationError`; store failure ⇒ `MetadataError` | 🔶 |

**I. Documentation and release**

| ID | Criterion | Status |
| --- | --- | --- |
| I1 | `docs/migrations.md` "future migration" example rewritten — its current `0002_add_tags` sketch contradicts the shipped two-table design | ❌ |
| I2 | `docs/architecture.md` and `docs/getting-started.md` document tags (domain model + usage example) | ❌ |
| I3 | `CHANGELOG.md` records the feature; semver-minor bump | ❌ |
| I4 | `AGENTS.md` `IMetadataStore` composition description includes `tags` | ❌ |

### 3.7 Definition of Done

- All ❌/🔶 criteria above reach ✅; `pnpm build`, `pnpm typecheck`, `pnpm exec vitest run` green on the full head SHA.
- Shared `ITagStore` contract tests run against Kysely (SQLite in-memory) and Cosmos (mocked container).
- §3.5 error contract holds in tests, including the soft-delete filtering of D2.
- Documentation set (I1–I4) merged; human review approves the final head SHA per the repository workflow.

---

## 4. Plan

### Phase 1 — Landed (superseded draft PR #28)

Core models/schemas/ports, service operations, Kysely store + migration `0002_add_tags`, Cosmos store + doc mapper, service-level unit tests. Verification: typecheck + 141 tests green.

### Phase 2 — Correctness fixes (criteria B2/B4, D2, F2)

1. Service-layer rejection of blank normalized names and empty `ownerId` with `ValidationError` (B2/B4), with tests.
2. Soft-delete filtering in `listFilesByTag`/`listFileTags` (D2): service filters resolved files by `status`, or stores join against file status — decided at implementation; spec only pins the visible behavior.
3. Expose `deleteTag` on `IStorageService` + `DefaultStorageService` (F2), idempotent-silent, with tests.

### Phase 3 — Test completion (criteria A3–A5, C2/C4/C6, D3, E2/E3, F3, G1–G4)

1. Shared `ITagStore` contract test suite; run against Kysely on SQLite in-memory and Cosmos against a mocked container.
2. Fill the untested service-level criteria with mock-store unit tests.

### Phase 4 — Documentation and release (criteria I1–I4)

1. Rewrite the `0002_add_tags` example in `docs/migrations.md` to match the shipped design; tags sections in `docs/architecture.md` / `docs/getting-started.md`; `AGENTS.md` composition fix.
2. `CHANGELOG.md` entry; semver-minor bump; PR to Ready with verification evidence for the full head SHA.

### Pitfalls

- **Do not "fix" red tests by relaxing assertions** — mismatches go back to §3 (reconcile per SDD §5.3), never the reverse.
- **Idempotency lives at two layers.** Service-level `getTagByName`-then-create is a convenience; the store-level unique constraint / deterministic id is the guarantee. Tests must exercise the store-level path directly (G2/G3) or a race between the two service calls goes unnoticed.
- **Soft-delete filtering is easy to regress.** D2 needs a dedicated test per adapter plus a service-level test; a future `restoreFile` capability must re-include the file without further changes.
- **Cosmos 409 read-back must return the stored document, not the request input** — the stored `createdAt`/`metadata` win.

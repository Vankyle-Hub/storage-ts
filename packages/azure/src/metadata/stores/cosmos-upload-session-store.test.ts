import { describe, it, expect } from "vitest";
import type { Container } from "@azure/cosmos";
import { CosmosUploadSessionStore } from "@/metadata/stores/cosmos-upload-session-store";
import type { UploadedPartDoc } from "@/metadata/mappers/upload-session-doc.mapper";

/**
 * The slice of a Cosmos container the part methods use, backed by a Map
 * keyed like Cosmos itself: (partition key, id). `upsert` replaces a
 * document with the same key; the queries filter on the bound parameters.
 */
function fakeContainer(seed: UploadedPartDoc[] = []) {
  const docs = new Map<string, UploadedPartDoc>();
  const key = (doc: { pk: string; id: string }) => `${doc.pk}|${doc.id}`;
  for (const doc of seed) docs.set(key(doc), doc);

  const container = {
    items: {
      async upsert(doc: UploadedPartDoc) {
        docs.set(key(doc), doc);
        return { resource: doc };
      },
      query(
        spec: { parameters: { name: string; value: unknown }[] },
        options: { partitionKey: string },
      ) {
        const param = (name: string) =>
          spec.parameters.find((p) => p.name === name)?.value;
        const partNumber = param("@partNumber");
        return {
          async fetchAll() {
            const resources = [...docs.values()].filter(
              (doc) =>
                doc.pk === options.partitionKey &&
                doc.sessionId === param("@sessionId") &&
                (partNumber === undefined || doc.partNumber === partNumber),
            );
            return { resources };
          },
        };
      },
    },
  };

  return { store: new CosmosUploadSessionStore(container as unknown as Container), docs };
}

function legacyPart(id: string, partNumber: number, etag: string, uploadedAt: string): UploadedPartDoc {
  return {
    id,
    pk: "s1",
    type: "uploaded-part",
    sessionId: "s1",
    partNumber,
    size: 1,
    etag,
    uploadedAt,
  };
}

describe("CosmosUploadSessionStore parts", () => {
  it("replaces an earlier registration of the same part number", async () => {
    const { store, docs } = fakeContainer();

    await store.addPart({
      id: "random-1",
      sessionId: "s1",
      partNumber: 1,
      size: 5,
      etag: '"first"',
      checksumSha256: "aa",
    });
    const second = await store.addPart({
      id: "random-2",
      sessionId: "s1",
      partNumber: 1,
      size: 7,
      etag: '"second"',
    });

    expect(docs.size).toBe(1);
    expect(second.size).toBe(7);
    expect(second.etag).toBe('"second"');
    expect(second.checksumSha256).toBeUndefined();

    const parts = await store.listParts("s1");
    expect(parts).toHaveLength(1);
    expect(parts[0]!.etag).toBe('"second"');
    expect((await store.getPart("s1", 1))?.etag).toBe('"second"');
  });

  it("keeps part numbers and sessions apart", async () => {
    const { store } = fakeContainer();

    await store.addPart({ id: "a", sessionId: "s1", partNumber: 2, size: 1, etag: "s1-2" });
    await store.addPart({ id: "b", sessionId: "s1", partNumber: 1, size: 1, etag: "s1-1" });
    await store.addPart({ id: "c", sessionId: "s2", partNumber: 1, size: 1, etag: "s2-1" });

    expect((await store.listParts("s1")).map((p) => [p.partNumber, p.etag])).toEqual([
      [1, "s1-1"],
      [2, "s1-2"],
    ]);
    expect((await store.listParts("s2")).map((p) => p.etag)).toEqual(["s2-1"]);
    expect(await store.getPart("s2", 2)).toBeUndefined();
  });

  it("returns only the latest registration when older versions left duplicates", async () => {
    // Up to 0.5.0 every registration got a random id, so one part number
    // could have several documents.
    const { store } = fakeContainer([
      legacyPart("random-new", 1, "new", "2026-01-01T00:00:05.000Z"),
      legacyPart("random-old", 1, "old", "2026-01-01T00:00:01.000Z"),
      legacyPart("random-two", 2, "two", "2026-01-01T00:00:02.000Z"),
    ]);

    expect((await store.listParts("s1")).map((p) => [p.partNumber, p.etag])).toEqual([
      [1, "new"],
      [2, "two"],
    ]);
    expect((await store.getPart("s1", 1))?.etag).toBe("new");
  });

  it("lets a new registration win over a legacy duplicate", async () => {
    const { store } = fakeContainer([
      legacyPart("random-old", 1, "old", "2026-01-01T00:00:01.000Z"),
    ]);

    await store.addPart({ id: "x", sessionId: "s1", partNumber: 1, size: 9, etag: "retry" });

    const parts = await store.listParts("s1");
    expect(parts).toHaveLength(1);
    expect(parts[0]!.etag).toBe("retry");
    expect(parts[0]!.size).toBe(9);
  });
});

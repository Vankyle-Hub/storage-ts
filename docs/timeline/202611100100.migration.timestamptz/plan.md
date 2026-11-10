# Plan

1. `types.ts`: add `"mysql"`, `MigrationOptions`, zone validation. `getColumnTypes` unchanged in effect (0001 frozen).
2. `0002_timestamptz.ts`: frozen column list; PostgreSQL via raw `ALTER TABLE` built with `sql.ref` / `sql.lit` (the schema builder cannot express `USING`); SQLite `UPDATE … WHERE col GLOB …`.
3. `index.ts` / `sql-generator.ts`: thread options through, MySQL query compiler, comment for empty scripts, typed unknown-key error.
4. Mappers: one shared `ensureDate` in `mappers/timestamp.ts`.
5. Tests: registry, fixtures (frozen SQL), per-dialect statements, option validation, mapper parsing.
6. Verify on real databases (throwaway Docker containers, `node:sqlite`).
7. Docs: `migrations.md` rewrite, `architecture.md`, `getting-started.md`, kysely README, renumber the planned tiering migration to 0003.

Pitfalls:

- `ALTER COLUMN … TYPE` keeps the old default as a cast expression; drop and re-set it in the same statement.
- The zone is a literal inside DDL, not a bind parameter — validate it.
- Running the PostgreSQL SQL twice shifts data (`timestamptz AT TIME ZONE` returns a `timestamp`). The migrator prevents it; hand-applied SQL does not.
- `0002` is also claimed by in-flight branches (`0002_tiering`, `0002_add_tags`); they must renumber.

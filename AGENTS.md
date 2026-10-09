# Agent Entry Point

Before starting work, read the [SDD rules](docs/coding.md), the [architecture and package boundaries](docs/architecture.md), and any active feature spec such as [tiered storage](docs/tiered-storage.md). Contribution entry point: [CONTRIBUTING.md](CONTRIBUTING.md); local setup: [README.md](README.md) and [docs/getting-started.md](docs/getting-started.md); schema evolution: [docs/migrations.md](docs/migrations.md).

## GitHub Collaboration

`master` is the only long-lived branch. Code and configuration tasks — including quick fixes, dependency upgrades, and hotfixes — first create or reference an Issue, branch from the latest `origin/master` as `<type>/<issue-number>-<slug>`, and open a Draft PR early before implementing and testing locally. Use `feat/`, `fix/`, `hotfix/`, `docs/`, `refactor/`, `perf/`, `test/`, `ci/`, `build/`, `chore/`; do not use a shared `dev/` or `feature/` branch.

Issues collect problems and needs; reporters are not required to provide implementation plans. Solutions, acceptance criteria, progress, blockers, CI results, Draft/Ready transitions, review, and release evidence are tracked in the PR. Issues only accumulate problem information, links, and the final resolution conclusion.

Write GitHub titles, bodies, comments, reviews, and templates in English. Issue titles follow the repository templates (`bug: …`, `feat: …`, `task: …`); PR titles follow the conventional commit format `type(scope): summary` from [CONTRIBUTING.md](CONTRIBUTING.md), since squash merge turns the PR title into the commit message. Maintainers apply suitable existing English labels and set Assignee, Reviewer, Milestone, and Projects as needed.

Code and configuration reach `master` only through a PR; never push directly or merge locally to bypass review. Push the finished implementation, record the applicable checks and evidence for the full head SHA, and only then mark Ready. A human maintainer must review and explicitly approve the exact current head SHA; new commits or conflict resolution require renewed approval. Agent review, CI status, Ready state, or blanket task authorization do not substitute for human approval. These rules apply even without branch protection. Never reset, force-push, or delete `master`.

After a PR merges and fully resolves an issue, add an English resolution comment linking the PR, then close the issue as completed; for auto-closed issues, only add a missing comment. Keep partially resolved issues open, and keep issues that explicitly require deployment or production acceptance open until that scope is fulfilled. Record merge, release, and validation separately.

Documentation-only changes (including non-executable issue/PR templates) may be edited or committed directly by maintainers without a dedicated issue or PR; an optional docs branch is `docs/<short-description>`. Code, dependencies, executable automation, migrations, and deployment configuration are never covered by this exception. Preserve unrelated local changes; do not fold existing in-flight work into the current task.

## Working with SDD

The full workflow lives in [docs/coding.md](docs/coding.md) (verbatim shared copy; do not modify it in this repo — propose changes upstream). Summary for this repository:

- **Two document families.** Long-lived docs (`docs/architecture.md`, `docs/getting-started.md`, `docs/migrations.md`, feature intent/design docs like `docs/tiered-storage.md`) are updated in place when intent or architecture actually changes. Task episodes (`spec`/`plan`/`notes`) live with the work and are archived under `docs/timeline/<YYYYMMDDHHMM>.<kind>.<topic>/` on completion, frozen forever.
- **Scale the ceremony to the task.** Quick-fix: no new spec, one changelog line. Feature: one episode with spec + lightweight plan + notes. Module or new package: full episode plus long-lived doc updates. When in doubt, scale down.
- **Anchor contracts, leave construction free.** Specs pin signatures, types, error behavior, invariants, and business intent — precisely. Function bodies, internal decomposition, and naming are the implementer's freedom.
- **Escalate calibrated.** Escalate only decisions that change contracts, violate principles, cross package boundaries, or are irreversible; decide and proceed on internal, local, reversible ones.
- **Verification against the contract.** When tests and implementation disagree, return to the spec and its intent; never relax assertions just to turn red green.

## Repository Map and Boundaries

pnpm workspace; packages under `packages/`: `shared` (errors/Result/utils, depends on nothing), `core` (domain, ports, application service; depends on `shared` + `zod` only), `s3`, `azure`, `cloudflare`, `kysely` (provider adapters). The dependency rules in [docs/architecture.md](docs/architecture.md#dependency-rules) are binding: `core` stays provider-agnostic, provider packages never import each other, and provider SDK types never leak into `core` or `shared`.

## Local Verification

```sh
pnpm install
pnpm build          # all packages
pnpm typecheck      # all packages
pnpm exec vitest run
```

Record executed commands, results, and known limits in the PR. Provider SDK calls are mocked in unit tests; do not require real cloud credentials for contributor checks. Metadata schema changes follow [docs/migrations.md](docs/migrations.md) for both `postgres` and `sqlite` flavors plus the Cosmos mapper.

Contributions are licensed under [MPL-2.0](LICENSE).

# Publishing

This repository publishes its packages to **two** registries:

| Registry | Scope | Packages |
|---|---|---|
| npmjs.com | `@vankyle` | `@vankyle/storage-shared`, `@vankyle/storage-core`, … |
| GitHub Packages | `@vankyle-hub` | `@vankyle-hub/storage-shared`, `@vankyle-hub/storage-core`, … |

`@vankyle/*` on npmjs.com is the **canonical, npm-first scope**. No authentication is required to install from there. GitHub Packages (`@vankyle-hub/*`) is a secondary registry that mirrors the same releases.

## How it works

The canonical package names in the repository are `@vankyle/*`. Publishing to npmjs.com is direct — no scope rewriting is needed. For GitHub Packages, the `scripts/publish-github.mjs` script temporarily rewrites each `package.json`:

1. Renames each package from `@vankyle/*` to `@vankyle-hub/*`.
2. Resolves `workspace:*` dependencies to concrete version numbers.
3. Sets `publishConfig.access` to `"public"`.
4. Rewrites `@vankyle/` → `@vankyle-hub/` in compiled `dist/` files.
5. Runs `pnpm publish --no-git-checks` per package.
6. Restores the original `package.json` and `dist/` files.

## Current package scope

The source-of-truth package names in this repository use the `@vankyle` scope:

- `@vankyle/storage-shared`
- `@vankyle/storage-core`
- `@vankyle/storage-s3`
- `@vankyle/storage-azure`
- `@vankyle/storage-cloudflare`
- `@vankyle/storage-kysely`

## Maintainer setup

### 1. Configure repository Actions permissions

In GitHub:

1. Open **Settings**.
2. Open **Actions** > **General**.
3. Under **Workflow permissions**, select **Read and write permissions**.
4. Save the setting.

This allows the publish workflow to use `GITHUB_TOKEN` for GitHub Packages.

### 2. Version the packages before publishing

GitHub Packages does not allow overwriting an existing package version. Before you publish:

1. Update the `version` field in each package you want to release.
2. Commit the version changes.
3. Tag or create a GitHub Release that corresponds to the published versions.

### 3. Publish through GitHub Actions

Two publish targets are handled by a single workflow:

- [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs build, typecheck, and tests on pushes and pull requests.
- [.github/workflows/publish-packages.yml](../.github/workflows/publish-packages.yml) publishes to **both** npmjs.com and GitHub Packages when a GitHub Release is published, or when you run it manually.

#### Required secrets

| Secret | Where | Purpose |
|---|---|---|
| `NPM_TOKEN` | Repository secret | Authenticates to npmjs.com (`Automation` type token from npmjs.com) |
| `GITHUB_TOKEN` | Automatic | Authenticates to GitHub Packages (used by `publish-github.mjs`) |

To add the npm token: GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name it `NPM_TOKEN`.

Recommended release flow:

1. Bump package versions.
2. Merge to the default branch.
3. Create a GitHub Release.
4. Let the publish workflow push the packages to npmjs.com and GitHub Packages.

## Consumer setup (npmjs.com — recommended)

Installing from npmjs.com requires no special authentication:

```bash
pnpm add @vankyle/storage-core @vankyle/storage-shared
pnpm add @vankyle/storage-s3
pnpm add @vankyle/storage-kysely kysely
```

## Consumer setup (GitHub Packages — secondary)

If you want to install from GitHub Packages instead, you must authenticate first.

### 1. Create a token for installs

Create a GitHub token with:

- `read:packages`
- `repo` access if the packages are private

### 2. Configure `.npmrc`

Add this to your user-level `~/.npmrc` or project-level `.npmrc`:

```ini
@vankyle-hub:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
always-auth=true
```

Then set the token in your shell:

```bash
export GITHUB_PACKAGES_TOKEN=YOUR_GITHUB_TOKEN
```

### 3. Install packages

```bash
pnpm add @vankyle-hub/storage-core @vankyle-hub/storage-shared
pnpm add @vankyle-hub/storage-s3
pnpm add @vankyle-hub/storage-kysely kysely
```

### 4. Use in CI for consumer repositories

In a consumer repository GitHub Actions workflow:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    registry-url: https://npm.pkg.github.com
    scope: '@vankyle-hub'

- run: pnpm install --frozen-lockfile
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_PACKAGES_TOKEN }}
```

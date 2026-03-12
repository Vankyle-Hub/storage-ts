# GitHub Packages

This repository can publish its package workspaces to the GitHub Packages npm registry.

## Current package scope

The published package names in this repository use the `@vankyle-hub` scope:

- `@vankyle-hub/storage-shared`
- `@vankyle-hub/storage-core`
- `@vankyle-hub/storage-s3`
- `@vankyle-hub/storage-azure`
- `@vankyle-hub/storage-cloudflare`
- `@vankyle-hub/storage-kysely`

The Git remote for this repository is `Vankyle-Hub/storage-ts`, so the package scope now matches the current GitHub owner namespace.

## Maintainer setup

### 1. Configure repository Actions permissions

In GitHub:

1. Open **Settings**.
2. Open **Actions** > **General**.
3. Under **Workflow permissions**, select **Read and write permissions**.
4. Save the setting.

This allows the publish workflow to use `GITHUB_TOKEN` for GitHub Packages because the package namespace matches the repository owner.

### 2. Version the packages before publishing

GitHub Packages does not allow overwriting an existing package version. Before you publish:

1. Update the `version` field in each package you want to release.
2. Commit the version changes.
3. Tag or create a GitHub Release that corresponds to the published versions.

### 3. Publish through GitHub Actions

Two workflows are included:

- [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs build, typecheck, and tests on pushes and pull requests.
- [.github/workflows/publish-packages.yml](../.github/workflows/publish-packages.yml) publishes all workspace packages when a GitHub Release is published, or when you run it manually.

Recommended release flow:

1. Bump package versions.
2. Merge to the default branch.
3. Create a GitHub Release.
4. Let the publish workflow push the packages to GitHub Packages.

## Consumer setup

Users must authenticate to GitHub Packages before installing from this registry.

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

## Notes for package users

- All package installation commands in this repository assume the `@vankyle-hub` scope.
- Public packages on GitHub Packages may still require registry configuration even when the package contents are publicly visible.
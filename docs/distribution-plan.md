# Distribution Plan

This document describes how `@monzingo89/engineer-maxxing` is distributed and versioned.

## Goals

- Keep releases predictable and easy to consume.
- Ensure package quality before publish.
- Provide clear upgrade guidance for users.

## Distribution Channels

### npm (primary)

- Package: `@monzingo89/engineer-maxxing`
- Usage: `npx @monzingo89/engineer-maxxing`
- Access: public scoped package

### GitHub Packages (secondary)

- Registry: `https://npm.pkg.github.com`
- Package: `@monzingo89/engineer-maxxing`
- Access depends on repository/package visibility and permissions.

### GitHub Releases (tertiary)

- Repository: `https://github.com/Monzingo89/engineer-maxxing`
- Semver tags (e.g., `v1.0.4`) are used for release tracking.
- Release notes summarize feature additions, fixes, and migration notes.

## Release Cadence

- `patch` releases for bug fixes and quality improvements.
- `minor` releases for backward-compatible features.
- `major` releases for breaking changes.

## Release Process

### Clean-tree release (recommended)

1. Ensure branch is up to date and CI is green.
2. Run local checks:
   - `npm run verify:publish`
3. Bump version and verify:
   - `npm run release:patch` or `npm run release:minor`
4. Publish package(s):
   - npmjs only: `npm run publish:public`
   - dual publish: `npm run publish:dual`
5. Push commits and tags:
   - `git push origin main --follow-tags`
6. Create/update GitHub Release notes for the version tag.

### In-progress-tree release (no git tag/version commit)

Use this only when you intentionally need to publish from an uncommitted working tree.

1. Bump local version without git tag:
   - `npm run release:patch:local` or `npm run release:minor:local`
2. Publish package(s):
   - npmjs only: `npm run publish:public`
   - dual publish: `npm run publish:dual`
3. Immediately follow up by committing release artifacts/changelog and creating the git tag on the matching commit.

## Post-release checklist

- Confirm npm registry version:
  - `npm view @monzingo89/engineer-maxxing version`
- Confirm GitHub Packages version (authenticated):
   - `npm view @monzingo89/engineer-maxxing version --registry=https://npm.pkg.github.com`
- Update `CHANGELOG.md` with release date and notes.
- Ensure `docs/distribution-plan.md` reflects current latest tag.
- Add or update GitHub release notes.

## Quality Gates

- Type check: `npm run lint`
- Build: `npm run build`
- Tests: `npm run test:dist`
- Packaging dry-run: `npm pack --dry-run`

## Rollback / Mitigation

- If a release is broken, publish a follow-up patch as soon as possible.
- Mark problematic release clearly in GitHub Releases and changelog.
- Avoid force-changing published versions; always release a new semver version.

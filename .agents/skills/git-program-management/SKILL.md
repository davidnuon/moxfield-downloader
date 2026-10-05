---
name: git-program-management
description: Use when breaking down epics into atomic Git tasks/PRs, auditing repo health and commit history, generating release changelogs, or tracking milestone progress.
---

# Git Program Management Runbook

## 1. Project Health Audit
Run this inspection sequence to assess project state:
1. **Uncommitted Changes**: `git status --short`
2. **Branch Topology**: `git log --graph --oneline --decorate -n 15`
3. **Stale / Divergent Branches**: `git branch -vv`
4. **Recent Activity by Author**: `git shortlog -sn --since="2 weeks ago"`

## 2. Work Breakdown Structure (WBS) to PR Mapping
When decomposing a feature:
- **Phase 1: Foundation (PR 1)**: Core types, schemas, interfaces, config files.
- **Phase 2: Core Logic (PR 2)**: Business logic, pure algorithms, unit tests.
- **Phase 3: Integration (PR 3)**: External network clients, filesystem IO, CLI glue.
- **Phase 4: Polish & Documentation (PR 4)**: End-to-end tests, documentation, error handling refinements.

## 3. Conventional Commits Standard
Enforce clean commit headers:
- `feat(deck-parser): add support for Moxfield arena export format`
- `fix(scryfall): implement 100ms rate limit throttle on collection lookups`
- `refactor(stream): convert file downloader to node:stream/promises`
- `test(rules): add commander color identity unit tests`
- `chore(nix): bump nixpkgs to 24.05 in flake.lock`

## 4. Release Checklist Template
- [ ] Working directory clean (`git status --porcelain` is empty).
- [ ] Test suite passing (`npm test` / `vitest run`).
- [ ] Flake checks clean (`nix flake check`).
- [ ] Version bumped in `package.json` according to SemVer.
- [ ] Changelog updated with relevant commit range (`git log v1.0.0..HEAD --oneline`).
- [ ] Tagged release with annotated tag: `git tag -a v1.1.0 -m "Release v1.1.0"`.

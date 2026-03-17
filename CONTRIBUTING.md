# Contributing to FastDock

Thank you for your interest in contributing! This document explains how to set up a development environment, the conventions used in this project, and how to submit changes.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Report a Bug](#how-to-report-a-bug)
- [How to Request a Feature](#how-to-request-a-feature)
- [Development Setup](#development-setup)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)

---

## Code of Conduct

Please be respectful and constructive in all interactions. This project follows basic open-source community norms: no harassment, no discrimination, and good-faith communication.

---

## How to Report a Bug

1. Search [existing issues](https://github.com/totomusu/fastdock/issues) first to avoid duplicates.
2. Open a new issue and include:
   - FastDock version (or commit hash)
   - Operating system and Docker version
   - Steps to reproduce
   - Expected vs. actual behaviour
   - Any relevant logs from the console or Docker

---

## How to Request a Feature

1. Open an issue with the title prefix `[Feature Request]:`.
2. Describe the problem you're trying to solve — not just the solution.
3. If you plan to implement it yourself, say so in the issue before starting work.

---

## Development Setup

**Prerequisites**

- Node.js ≥ 16.0.0
- npm ≥ 8
- Docker daemon running locally (for end-to-end testing)

**Steps**

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/fastdock.git
cd fastdock

# 2. Install dependencies
npm install

# 3. Start the dev server (auto-reloads on file changes)
npm run dev
```

Open `http://localhost:3080` in your browser.

> Do **not** run `npm run dev server.js` — `server.js` is already the entrypoint and extra arguments are forwarded to Node, causing an error.

**Project layout**

```
server.js           # Entry point — middleware wiring and server startup
routes/             # Express route handlers (containers, app-settings, icons)
middleware/         # Multer upload config, global error handler
utils/dataStore.js  # Atomic JSON read/write helpers
public/             # Static frontend (HTML, CSS, vanilla JS)
data/               # Runtime JSON storage (created on first boot, gitignored)
```

---

## Branch Naming

| Type | Pattern | Example |
|---|---|---|
| New feature | `feature/<short-description>` | `feature/container-search` |
| Bug fix | `fix/<short-description>` | `fix/icon-upload-mime-check` |
| Documentation | `docs/<short-description>` | `docs/api-reference` |
| Chore / tooling | `chore/<short-description>` | `chore/update-dependencies` |

Always branch off `main`.

---

## Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `chore`, `style`.

Examples:

```
feat(icons): add drag-and-drop icon upload
fix(upload): reject files with mismatched MIME and magic bytes
docs(readme): add reverse proxy configuration example
```

Keep the subject line under 72 characters. Write it in the imperative mood ("add", not "added" or "adds").

---

## Pull Request Process

1. Ensure your branch is up to date with `main` before opening a PR:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Open a Pull Request against `main` with:
   - A clear title (following commit message conventions).
   - A description of **what** changed and **why**.
   - Screenshots or a short demo if the change affects the UI.

3. Address any review feedback promptly.

4. A PR is merged once it has at least one approving review and all discussions are resolved.

---

## Code Style

FastDock uses vanilla JavaScript (no framework) on both the server and client. There is no formal linter configured yet — please follow the style of the surrounding code:

- **Indentation**: 4 spaces (no tabs).
- **Quotes**: single quotes for strings in JS.
- **Async**: use `async/await`; avoid raw `.then()` chains.
- **Error handling**: always propagate errors to the global error handler via `next(err)` in Express routes; never swallow errors silently.
- **Validation**: validate all user-supplied input server-side before use. Never trust client-provided values.
- **No `console.log` in production paths**: use `console.error` for genuine errors only.
- **Atomic writes**: use `dataStore.js` helpers for any JSON persistence — do not write files directly.

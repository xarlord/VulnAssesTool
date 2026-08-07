# VulnAssesTool Deployment Guide

**Last Updated:** 2026-08-07

This guide covers building and running VulnAssesTool as a web application: an Express API
server that also serves the built React/Vite frontend as static files.

> VulnAssesTool was migrated off Electron to a client/server web app. There is no
> electron-builder packaging, code signing, installer, or auto-update mechanism anymore —
> deployment is "build the client and server bundles, then run the Node server."

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Install](#install)
4. [Build](#build)
5. [Run](#run)
6. [Environment Variables](#environment-variables)
7. [Data Directory & NVD Database](#data-directory--nvd-database)
8. [Reverse Proxy / Network Exposure](#reverse-proxy--network-exposure)
9. [Troubleshooting](#troubleshooting)

---

## Overview

VulnAssesTool has two build outputs from one repo:

- **Client** — React + Vite, built to `dist/renderer/`.
- **Server** — Express + better-sqlite3 (`server/index.ts`), compiled with `tsc` to `dist/server/`.

In production, a single Node process (`dist/server/index.js`) does all of the following on one
port:

- Serves the built client as static files from `dist/renderer/`.
- Exposes the REST API under `/api/*`.
- Exposes a WebSocket channel at `/ws`.
- Falls back to `dist/renderer/index.html` for any unmatched non-API GET route (SPA client-side
  routing).

There is also an optional CLI (`vulnshield`, built to `dist/cli/index.js`) that shares SBOM
parse/export logic with the web app — see [`cli/`](../cli). It is not required to run the web
app.

---

## Prerequisites

- **Node.js 20** — the project's CI (`.github/workflows/ci.yml`) builds and tests against Node
  20 on Ubuntu and Windows; use that version for parity. The repo does not currently pin an
  `engines` field or ship an `.nvmrc`.
- **npm** (bundled with Node).
- A native build toolchain for `better-sqlite3`'s prebuilt/compiled binary (normally satisfied by
  a standard Node install; only matters if npm falls back to building from source).
- Optional: the **Syft** CLI if you want SBOM-from-binary generation (`/api/sbom`) — see
  [Environment Variables](#environment-variables) below. Without it, that one feature is
  unavailable but the rest of the app works.

---

## Install

```bash
npm ci
```

---

## Build

```bash
# Client only (Vite -> dist/renderer)
npm run build

# Server only (tsc -p tsconfig.server.json -> dist/server)
npm run build:server

# CLI only (-> dist/cli)
npm run build:cli

# All three (client + server + CLI) — use this for a full production build
npm run build:all
```

---

## Run

Production start command:

```bash
npm start
```

This runs `node dist/server/index.js` (also declared as the package's `main` entry). It binds to
`127.0.0.1` (see [Environment Variables](#environment-variables) — the host is not currently
configurable) on the port from `PORT` (default `3001`), and requires `dist/renderer/` and
`dist/server/` to already exist from the build step above.

For local development (hot-reload client + server together, no build step needed):

```bash
npm run dev
```

`npm run dev` runs the Express server (`tsx watch server/index.ts`) on port 3001 alongside Vite
on port 3000; Vite proxies `/api` and `/ws` to the Express server. In development, auth is
skipped and the server does not serve static files or the SPA fallback (see `server/app.ts`)
— that behavior is production-only.

---

## Environment Variables

All of these are optional; defaults are shown where the code defines one.

| Variable                       | Purpose                                                                                                                                                                                                                         | Default                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `PORT`                         | Port the Express server listens on. Invalid/non-numeric values silently fall back to the default.                                                                                                                               | `3001`                                                                        |
| `DATA_DIR`                     | Root directory for the SQLite NVD database, backups, logs, the auth token file, and stored credentials/keys.                                                                                                                    | `~/.vulnassesstool` (`os.homedir()/.vulnassesstool`)                          |
| `NODE_ENV`                     | `development` skips API auth and disables static/SPA serving (used by `npm run dev` and tests). Anything else (including unset) is treated as production — auth is ON.                                                          | `production`                                                                  |
| `RATE_LIMIT_MAX`               | Overrides the per-window request cap for the search/sync rate limiters (intended for controlled runs, e.g. E2E, that share one client IP). When unset, the hardened production defaults apply (search: 300/min, sync: 10/hour). | unset (hardened defaults apply)                                               |
| `NIST_API_KEY` / `NVD_API_KEY` | Fallback NVD API key used for bulk sync if no key has been saved via **Settings > API Configuration** in the UI. `NIST_API_KEY` is checked first.                                                                               | none — sync without a key is possible but much slower and rate-limited by NVD |
| `SYFT_PATH`                    | Explicit path to a Syft CLI binary, used by SBOM-from-binary generation (`/api/sbom`). If unset, the app falls back to a provisioned/cached copy, then to `syft` on `PATH`.                                                     | unset (auto-resolved)                                                         |
| `SBOM_LOCAL_SCAN_ROOT`         | Enables scanning an artifact already on the host filesystem by path (instead of uploading it) for `/api/sbom`. The feature is disabled unless this is set, and the path is confined to this root.                               | unset (feature disabled)                                                      |
| `VAT_WSL_DISTRO`               | WSL distro name used when unpacking Android images (e.g. `super.img`) on Windows via WSL.                                                                                                                                       | `Ubuntu`                                                                      |

Note: the server host (`127.0.0.1`) is hardcoded in `server/config.ts` and is not currently
exposed as an environment variable — see [Reverse Proxy / Network Exposure](#reverse-proxy--network-exposure)
if you need it reachable from outside the host.

---

## Data Directory & NVD Database

The SQLite NVD database, backups, logs, the generated auth token, and stored credentials all
live under `DATA_DIR` (default `~/.vulnassesstool`). For how the NVD CVE database is seeded,
synced, and kept up to date, see [`DATABASE_SETUP.md`](DATABASE_SETUP.md) rather than duplicating
that process here.

---

## Reverse Proxy / Network Exposure

The server binds to `127.0.0.1` only (see `server/config.ts`) — it is not directly reachable from
other hosts. To expose it on a network, put it behind a reverse proxy (nginx, Caddy, IIS, etc.)
running on the same host, terminating TLS and forwarding to `http://127.0.0.1:<PORT>` (including
WebSocket upgrade for `/ws`).

---

## Troubleshooting

**Port already in use**

The server logs `Port <PORT> is already in use.` and exits (see `server/index.ts`). Set a
different `PORT` or stop the process holding it.

**"Frontend not built. Run npm run build first."**

The server returns this (HTTP 404) when it can't find `dist/renderer/index.html` in production
mode. Run `npm run build` (or `npm run build:all`) before `npm start`.

**Auth errors (401/403) hitting the API directly**

In production the server requires a `Bearer` token on all `/api/*` routes except
`/api/health` and `/api/handshake`. The token is generated on first run and stored at
`<DATA_DIR>/.server-token`; the web UI fetches it automatically via `/api/handshake`. Set
`NODE_ENV=development` only for local/dev use — it disables this check entirely.

**Native module errors for `better-sqlite3`**

Run `npm rebuild` to rebuild native bindings for your current Node version/platform.

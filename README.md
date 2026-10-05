# Moxfield Account Deck Downloader

A resilient CLI tool to download, archive, and incrementally synchronize all Magic: The Gathering decks from a [Moxfield](https://www.moxfield.com) user account.

## Features

- **Full Account Archival**: Enumerate and download every deck from any public Moxfield account (or private decks with an auth token).
- **Multi-Format Export**:
  - `text` / `arena`: Clean MTGA / Universal text list (`COMMANDER`, `DECK`, `SIDEBOARD`, `CONSIDERING`).
  - `json`: Complete high-fidelity Moxfield JSON schemas.
  - `mtgo`: Magic: The Gathering Online format.
- **Smart Incremental Sync**: Tracks remote update timestamps via `.moxfield-manifest.json` to skip unmodified decks on subsequent runs.
- **Service-Friendly Rate Limiting**: Automatic pacing, concurrency control, and retry backoff.
- **Cloudflare Navigation**: Built-in transport resilience against TLS fingerprint bot blocks.
- **Flexible Organization**: Group decks by format (`commander/`, `modern/`, etc.) or flat layout with filesystem-safe title sanitization.

---

## Quick Start (with Nix)

Enter the reproducible development shell with Node.js, pnpm, and all dependencies ready:

```bash
nix develop
```

Or if you use `direnv`:
```bash
direnv allow
```

### Install Dependencies & Build
```bash
pnpm install
pnpm build
```

### Run Tests
```bash
pnpm test
```

---

## CLI Usage

When inside the environment (`nix develop` or `direnv`), `moxfield-downloader` is directly available in your `PATH`:

### Basic Download
```bash
moxfield-downloader download <username>
```

### Dry Run (Preview without downloading)
```bash
moxfield-downloader download <username> --dry-run
```

### Custom Output Directory & Formats
```bash
moxfield-downloader download <username> \
  --output ./my-decks \
  --format text,json,mtgo \
  --group-by format
```
  --format text,json,mtgo \
  --group-by format
```

### Options & Flags

```text
Usage: moxfield-downloader download [options] <username>

Arguments:
  username                Moxfield username

Options:
  -o, --output <dir>      Destination directory for decks (default: "./decks")
  -f, --format <formats>  Comma-separated export formats (json, text, arena, mtgo) (default: "text,json")
  --group-by <strategy>   Folder grouping strategy: "format" or "none" (default: "format")
  --flat                  Output files directly without creating subdirectories per deck (default: false)
  --no-considering        Exclude considering / maybeboard cards
  --no-incremental        Re-download all decks, ignoring the sync manifest
  --concurrency <n>       Maximum parallel HTTP requests (default: 2)
  --delay <ms>            Delay between sequential requests in milliseconds (default: 350)
  --token <token>         Optional Moxfield session/Bearer token for private decks
  --dry-run               Preview decks to download without saving files (default: false)
  -v, --verbose           Enable verbose logging (default: false)
  -h, --help              Display help
```

---

## Architecture & Specifications

For architectural details, API mechanics, and design decisions, see:
- [ADR 0001: Architecture & Technical Specification](adr/0001-moxfield-account-deck-downloader-spec.md)
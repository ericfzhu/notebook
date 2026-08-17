# Notebook

Notebook is a private, searchable home for Kindle highlights, notes, and bookmarks. Connect a Kindle to your computer, choose `documents/My Clippings.txt`, and Notebook safely adds only clippings it has not seen before.

The application is designed for cumulative Kindle exports:

- importing the same file again creates no duplicates;
- a later import never overwrites edited text, tags, commentary, favorites, or archive state;
- original Kindle text and metadata remain available after display edits;
- missing items in a later file are never interpreted as deletions.

## Architecture

```text
Next.js static export
        │
        ├── browser parses My Clippings.txt
        │
        └── /api/*
              │
        Cloudflare Worker
              │
        Cloudflare D1
```

The frontend remains a static Next.js application. Cloudflare serves the generated assets and runs a small Worker only for API routes. The raw Kindle file is parsed in the browser and is not retained; structured clipping text and metadata are sent to D1.

The Worker and static frontend are deployed together from `wrangler.jsonc`.

## Product experience

The interface is organized around the way the library is used rather than around database tables:

- persistent book navigation on desktop and a drawer on mobile;
- one global search across clipping text, commentary, books, authors, and tags;
- book-level reading order;
- filters for highlights, notes, bookmarks, favorites, and archived items;
- a contextual clipping editor for display text, commentary, tags, favorites, and archive state;
- separate editable display metadata for book titles and authors;
- import summaries showing added, skipped, and unparsed entries.

## Local development

Install dependencies:

```bash
npm install
```

Create a D1 database:

```bash
npx wrangler@4.68.0 login
npm run db:create
```

Wrangler prints a `database_id`. Replace the placeholder ID in `wrangler.jsonc`:

```jsonc
"database_id": "00000000-0000-0000-0000-000000000000"
```

Apply the schema to a local D1 database and start the combined static/Worker preview:

```bash
npm run db:migrate:local
npm run preview
```

For ordinary frontend-only work, the Next.js development server is also available:

```bash
npm run dev
```

API requests require the Wrangler preview because D1 is bound to the Worker, not to the standalone Next.js development server.

## Deploy to Cloudflare

Apply migrations to the remote database, then deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

The build produces a static export in `out/`. Wrangler uploads those assets and deploys `src/worker.ts` for `/api/*`.

### Protect the notebook

Notebook is intentionally implemented as a single-user application and does not include a public sign-up system. Put the deployed Worker behind **Cloudflare Access** before importing personal notes. Restrict access to your own email address or identity provider account.

Do not expose the deployment publicly without an access policy: the Worker API can read and modify everything in the bound D1 database.

## Importing from Kindle

1. Connect the Kindle to the computer with USB.
2. Open the Kindle volume and locate `documents/My Clippings.txt`.
3. Open Notebook and choose **Import Kindle file**.
4. Drop or select the text file.
5. Review the local parse summary and import it.

`My Clippings.txt` is cumulative. Notebook generates deterministic book identities and clipping fingerprints, then relies on D1 unique constraints as the final duplicate guard. Re-importing is therefore safe and idempotent.

## Data model

The first migration creates:

- `books` — immutable source identity plus editable display title and author;
- `clippings` — original text, optional edited text, Kindle position/date metadata, commentary, favorite state, and archive state;
- `tags` and `clipping_tags` — reusable many-to-many tags;
- `imports` — file name, hash, size, and import outcome counts.

The application never stores every uploaded cumulative source file. This avoids repeatedly storing the same content and keeps D1 usage small.

## Commands

```bash
npm run dev                # Next.js frontend development
npm run build              # Static Next.js export
npm run preview            # Build and run locally with Worker + D1
npm run deploy             # Build and deploy to Cloudflare
npm run db:create          # Create the D1 database
npm run db:migrate:local   # Apply migrations locally
npm run db:migrate:remote  # Apply migrations remotely
npm run lint               # Run ESLint
```

## Current scope

This version is optimized for a private personal library. It does not yet include multi-user accounts, offline synchronization, full-text-search virtual tables, automatic Kindle device discovery, or permanent storage of source files. Those can be added later without changing the core import identity model.

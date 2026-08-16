# Notebook

Notebook is a private, Cloudflare-hosted library for Kindle highlights, notes, and bookmarks. Connect a Kindle to your Mac, upload `My Clippings.txt`, and use the library to search, edit, tag, favorite, archive, and inspect each clipping.

The application uses:

- Next.js App Router for the interface and API routes
- Cloudflare Workers through the OpenNext adapter
- Cloudflare D1 as the source of truth
- Cloudflare Access (recommended) to keep the deployed notebook private

## Import behavior

Kindle stores clippings from many books in one cumulative file. Notebook therefore treats every upload as an idempotent import:

- known clipping fingerprints are skipped;
- new clippings are inserted;
- user-edited text, personal notes, tags, favorites, and archived state are never overwritten;
- a changed clipping at the same Kindle location is added and marked **Needs review**;
- an identical source file is recognized and does no work.

The original `.txt` file is parsed in the browser and is never sent to the Worker. Only structured clipping data and an import summary are stored in D1. Large libraries are sent in resumable batches so a first import stays within Cloudflare’s per-request D1 query limits.

## Local setup

### 1. Install dependencies

Node.js 20 or newer is recommended.

```bash
npm install
```

### 2. Sign in to Cloudflare

```bash
npx wrangler login
```

### 3. Create the D1 database

The repository defaults to Cloudflare's Oceania location hint, which is appropriate for an Australia-based personal deployment.

```bash
npm run db:create
```

No remote database is provisioned by this repository. Copy the `database_id` returned by Wrangler into `wrangler.jsonc`, replacing:

```text
00000000-0000-0000-0000-000000000000
```

Generate binding types after updating the configuration:

```bash
npm run cf-typegen
```

### 4. Create a local development database

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Open `http://localhost:3000`.

### 5. Initialize production and deploy

```bash
npm run db:migrate:remote
npm run deploy
```

Use `npm run preview` before deployment to test the production build in Cloudflare's Workers runtime.

The import path deliberately parses on-device and writes batches of 200 clippings. Each batch uses a small fixed number of D1 queries, so even a large initial library does not exceed the Workers Free limit of 50 D1 queries in one invocation.

## Protect the notebook

Kindle clippings are personal data. Before importing real notes into the deployed Worker, put the Worker or custom domain behind **Cloudflare Access** and allow only your identity. D1 is not exposed directly to the browser; all reads and writes go through the application's route handlers, but the application still needs an access policy at its public URL.

For a one-person notebook, an Access policy is simpler than maintaining registration, passwords, sessions, and account recovery inside this repository.

## Finding the Kindle clipping file on macOS

1. Connect the Kindle over USB.
2. Open the mounted Kindle volume in Finder.
3. Look in `documents/My Clippings.txt`.
4. Drag that file into Notebook's import dialog.

The exact mounted path can vary by Kindle model and macOS version, but the file itself is normally named `My Clippings.txt`.

## Data model

The initial migration creates:

- `books` — immutable Kindle source identity plus optional display metadata;
- `clippings` — source text, edited text, personal notes, metadata, state, and stable fingerprints;
- `tags` and `clipping_tags` — many-to-many organization;
- `imports` and `import_chunks` — resumable file sessions, hashes, and outcome counts.

Run migrations with:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## Useful commands

```bash
npm run dev              # Next.js development server with local D1 bindings
npm run typecheck        # TypeScript validation
npm run lint             # ESLint
npm run preview          # production build in workerd
npm run deploy           # deploy to Cloudflare Workers
npm run cf-typegen       # regenerate Cloudflare binding types
```

## Product design

The interface is organized around the repeated reading workflow rather than around database records:

- the left rail provides stable views for all clippings, favorites, review conflicts, archive, books, and tags;
- the central column is optimized for scanning passages and personal annotations;
- the detail panel keeps editing and source metadata available without losing the current list position;
- mobile layouts turn the detail panel into a focused full-screen editor;
- import results explicitly report additions, duplicates, conflicts, and parsing issues.

The visual system uses a warm neutral reading surface, restrained semantic accents, generous line height, and high-contrast text. This is intentionally closer to a reading notebook than an administration dashboard.

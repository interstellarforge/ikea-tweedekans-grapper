# Next.js migration — context

Branch: `nextjs-migration`. Goal: Next.js 16 (App Router) + React 19 + better-sqlite3 (same SQLite file/schema),
JSON API reusable by a future mobile app.

## Done

- Domain modules moved to `src/server/*`; driver swapped node:sqlite → better-sqlite3 (`Db` type in `db.ts`). 25 tests pass.
- Old `src/server.ts`/`src/main.ts` removed. Runtime singleton: `src/server/runtime.ts`; poller started in `src/instrumentation.ts`.
- API: 45 route handlers under `src/app/api/**` (+ `/healthz`) using `authed()`/`open()` from `src/server/api.ts`; same URLs and JSON as before. Smoke-tested via curl.

## Also done

- UI ported to React (`src/features/*`, `src/components/*`, `src/app/(app|public)`); `src/ui` removed; `proxy.ts` redirects unauthenticated page requests.
- Dockerfile/install.sh now build Next standalone; eslint config follows conventions.md (0 errors).

## Todo

- Manual regression pass on lists/buy/import dialogs with real data; restore-backup.sh uses node:sqlite (unchanged).
- Vitest style warnings (preset `all`) in older tests.

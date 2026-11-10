# Netlify setup

Netlify builds the Vite app with `npm run build`, publishes `dist`, and loads
Functions from `netlify/functions`. The `/api/*` rewrite is declared before the
SPA fallback in `netlify.toml`. The initial health endpoint is available at
`/api/health` and returns only `{ "status": "ok" }`.

## Environment variables

Configure these names in the Netlify site environment settings as needed. Do not
commit credential values.

### Public frontend variables

Vite embeds variables prefixed with `VITE_` in browser assets. Treat them as
public; never put server secrets in this group.

- `VITE_SUPABASE_URL` — Supabase project URL.
- `VITE_SUPABASE_ANON_KEY` — public Supabase anon/publishable key. Database access
  must be protected by RLS.

### Netlify Functions variables

Set these for server-side Functions; do not prefix server secrets with `VITE_`.

- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_ANON_KEY` — public anon/publishable key used to verify bearer tokens.
- `SUPABASE_SERVICE_ROLE_KEY` — secret privileged key; use only in server-side
  Functions and never expose it to frontend code or browser assets.

Shared authentication and authorization helpers live under
`netlify/functions/_shared/` and run in the Node.js 20 Functions runtime. They
read server configuration only from `process.env`, verify access tokens through
Supabase Auth, and load the matching application profile on the server. The
service-role client is server-only and is never imported by frontend modules or
configured as a `VITE_*` variable. Do not copy it into frontend environment
settings.

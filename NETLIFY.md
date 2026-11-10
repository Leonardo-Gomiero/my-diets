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

The browser Supabase client uses only these two public variables. Supabase Auth
manages the real session; the application does not create its own session or
provide a demo sign-in. After sign-in, the frontend requests `GET /api/me` with
the access token to obtain the application profile. Missing, invalid, or inactive
profiles do not establish an application session.

Students with `must_change_password` set receive only a password-change-required
response from authenticated data endpoints. `POST /api/me/password` is the
exception: it accepts the authenticated student's new password, updates Supabase
Auth first, then clears the profile flag. If the Auth update succeeds but the
profile update fails, the flag stays set and all data endpoints remain blocked;
the student can submit a new password to safely retry. The endpoint is
idempotent when a prior attempt already cleared the flag.

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

The `/admin` and `/student` React route guards control navigation and user
experience only. Function authorization and database RLS remain the security
boundary; do not rely on frontend role checks to protect data or operations.

## Deployment

1. Create a Supabase project and a Netlify site connected to this repository.
   Keep production and Deploy Preview environment values separate.
2. Apply the checked-in migrations to Supabase in timestamp order. For local
   validation, use `supabase start`, `supabase db reset`, and
   `supabase db lint`. For a reviewed production release, link the Supabase CLI
   to the intended project and apply pending migrations with
   `supabase db push`; verify the project reference before confirming the push.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the Netlify
   build environment. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` for Netlify Functions runtime. Do not expose the
   service-role key to the build environment or use a `VITE_` name for it.
4. Deploy the site. `netlify.toml` selects the Node.js 20 Functions runtime,
   builds with `npm run build`, publishes `dist`, and maps `/api/*` before the
   SPA fallback. Check `/api/health`, then complete the real authentication and
   patient/diet journey in a non-production preview with disposable accounts.
5. Provision the first ADMIN through the controlled procedure in
   [supabase/README.md](./supabase/README.md). Do not enable public registration
   or place initial credentials in the repository.

Before promoting a preview, confirm all five migrations are applied, Function
environment variables are available to Functions, frontend variables are
available at build time, and the deployed redirects reach the intended
Functions. A local build and mocked unit tests do not verify provider
configuration, deployed RLS, or real Supabase Auth behavior.

## Operations, recovery, and plan limits

- If a patient loses a temporary password, reset it from the admin interface;
  the old password is replaced and the patient must change the new one. The
  password is not recoverable after closing its one-time display.
- If reset reports that account setup is pending, normal data access remains
  blocked. Retry the reset; if the API reports recovery is still required,
  investigate the Supabase Auth/profile state through trusted administrative
  tools before re-enabling access.
- If account creation reports that cleanup needs recovery, check for the Auth
  identity and profile using the returned support code and remove or complete
  the orphaned account through a trusted operator. Never ask the patient to use
  a password from a failed response.
- Manage the nutritionist's own account through Supabase Auth. Rotate exposed
  project keys through Supabase and update the matching Netlify environment
  values, then redeploy/restart Functions as required by the provider.
- Free-plan quotas, project pausing, function limits, database/storage
  capacity, backup retention, and availability are provider-controlled and can
  change. Review the current Supabase and Netlify plan dashboards before
  launch; the free plans do not establish an application SLA or guaranteed
  backups.

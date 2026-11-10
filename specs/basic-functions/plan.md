# Technical Architecture & Implementation Plan: My Diets MVP

## 1. System Topology

The product is one repository and one deployable application, with the API implemented as Netlify Functions:

- **Frontend**: React 18, JavaScript/JSX, Vite, React Router DOM, React Context for authentication state, native `fetch`, pure CSS, and React Icons.
- **Hosting/API**: Netlify static hosting for the Vite build and Netlify Functions for privileged operations and application API endpoints.
- **Database**: Supabase-managed PostgreSQL on the free tier for the initial release.
- **Authentication**: Supabase Auth. The browser uses the public project URL and anon/publishable key; Netlify Functions use server-side secrets only when an administrative Auth operation is required.
- **Database access**: Supabase RLS is enabled for every application table. Functions validate the Supabase access token and enforce role, status, first-login, and ownership rules. Privileged functions use the service-role key only after those checks.
- **Migrations**: Versioned SQL migrations committed in `supabase/migrations/`; no database schema is created manually in production.

The free tier is an initial hosting choice, not a promise of unlimited storage, uptime, or backups. Confirm current provider quotas before production use.

## 2. Repository Structure

```text
netlify/
└── functions/
    ├── _shared/
    │   ├── auth.js
    │   ├── supabase.js
    │   ├── responses.js
    │   └── temporaryPassword.js
    ├── students.mjs
    ├── student.mjs
    ├── student-credentials.mjs
    ├── patient-diets.js
    ├── diet.js
    └── diet-activate.mjs
src/
├── assets/
├── components/
├── context/
├── layouts/
├── pages/
│   ├── admin/
│   │   └── DietEditorPage.jsx
│   ├── student/
│   └── auth/
├── services/
├── styles/
└── utils/
supabase/
└── migrations/
netlify.toml
```

Keep the existing React/Vite scaffold and component-specific CSS. Add only the modules needed by the MVP.

## 3. Data Model

Supabase Auth owns the `auth.users` identity records. Application profiles reference those identities; do not duplicate password hashes or authentication secrets in application tables.

### `profiles`

- `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `full_name TEXT NOT NULL`
- `role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STUDENT'))`
- `must_change_password BOOLEAN NOT NULL DEFAULT false`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at`, `updated_at TIMESTAMPTZ`

The first nutritionist profile is provisioned through a documented, controlled setup procedure. There is no default admin password, public sign-up, or credential seed committed to the repository.

### `student_details`

- `user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE`
- `phone TEXT NULL`
- `created_at`, `updated_at TIMESTAMPTZ`

This table contains only basic contact details in the MVP; no clinical notes or measurements.

### `diets`

- `id UUID PRIMARY KEY`
- `student_id UUID NOT NULL REFERENCES profiles(id)`
- `title TEXT NOT NULL`
- `version INTEGER NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))`
- Optional daily calorie/protein/carbohydrate/fat targets and general notes.
- `created_at`, `updated_at TIMESTAMPTZ`

Use a partial unique index to enforce at most one `ACTIVE` diet per student. Diet activation runs in a database transaction: archive the previous active version and activate the selected draft together.

### `meals`

- `id UUID PRIMARY KEY`
- `diet_id UUID NOT NULL REFERENCES diets(id) ON DELETE CASCADE`
- `order_index INTEGER NOT NULL`
- `name TEXT NOT NULL`
- Optional `scheduled_time TIME`, `target_calories INTEGER`, and `notes TEXT`

### `food_groups`

- `id UUID PRIMARY KEY`
- `meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE`
- `order_index INTEGER NOT NULL`
- `name TEXT NOT NULL`

### `food_options`

- `id UUID PRIMARY KEY`
- `food_group_id UUID NOT NULL REFERENCES food_groups(id) ON DELETE CASCADE`
- `order_index INTEGER NOT NULL`
- `label TEXT NOT NULL`
- `food_name TEXT NOT NULL`
- `quantity NUMERIC NOT NULL CHECK (quantity >= 0)`
- `unit TEXT NOT NULL`
- Optional calories, protein, carbohydrates, fats, and notes

Store numeric nutrition values in appropriate numeric/integer columns. Validate ordering, required fields, and reasonable limits in both API and database constraints.

## 4. Authentication and Authorization

### Supabase Auth flow

- Sign in with email/password through Supabase Auth; the application has no public registration route.
- Load the application profile after sign-in. Reject missing, inactive, or invalid-role profiles and sign out rejected users.
- Persist authentication through the official Supabase client. Never persist the service-role key or temporary passwords in client storage.
- Sign-out clears the Supabase session and in-memory application state.
- `ProtectedRoute` redirects unauthenticated visitors to `/login`; role-specific layouts redirect users to their correct home.
- A `must_change_password` profile may call only the password-change operation and sign-out. Apply this restriction in API guards as well as in React routing.
- The password-change operation updates the Supabase Auth password and profile flag; handle partial failure explicitly and do not grant normal access until both are confirmed.

### RLS policy model

- Enable RLS on `profiles`, `student_details`, `diets`, `meals`, `food_groups`, and `food_options`.
- Students may select their own basic profile and rows reachable only through their own active diet.
- Students have no insert, update, or delete access to diet data.
- The nutritionist may manage student and diet data; only an `ADMIN` profile may perform these operations.
- Database policies must validate identities from `auth.uid()` and database profile data, not a role or student ID supplied by the browser.
- Test RLS with separate admin and student identities. Service-role operations bypass RLS, so every function using that key must perform explicit authorization and ownership checks before each operation.

## 5. Temporary Password Lifecycle

1. `temporaryPassword.js` uses Node's cryptographic random source to create a strong temporary password.
2. `student-credentials` requires a valid admin access token and validates the student operation.
3. On creation, the function creates a Supabase Auth user and profile with role `STUDENT` and `must_change_password = true`.
4. On reset, the function first sets and confirms `must_change_password = true`, then changes the existing user's Supabase Auth password, and verifies the forced-change state before returning the password. If the Auth update or final confirmation is uncertain, it returns an explicit error without revealing the password and leaves normal access blocked so the admin can safely retry.
5. The plaintext password is included only in the successful create/reset response. It is not written to PostgreSQL, logs, analytics, or browser storage, and no later API can retrieve it.
6. The UI shows the value only in the immediate result screen, with a copy action and a warning that closing the screen loses the value.
7. Handle partial failure/rollback: if profile creation fails after Auth user creation, remove the orphaned Auth user; if a reset cannot update both Auth and profile state, return an explicit failure and leave the account in a safe, documented state.

Do not use a fixed, predictable, or hard-coded seed password.

## 6. Netlify Function API

All function routes are under `/.netlify/functions/` or are mapped to `/api/*` in `netlify.toml`. Use consistent JSON responses, validation, status codes, and non-sensitive errors.

| Method and route | Access | Purpose |
|---|---|---|
| `GET /api/patients?search=` | Admin | List/search active and inactive patient profiles |
| `POST /api/patients` | Admin | Create a patient and return the one-time temporary password |
| `GET /api/patients/:id` | Admin | Get profile and diet summary |
| `PUT /api/patients/:id` | Admin | Update full name, email, and optional phone |
| `PATCH /api/patients/:id/status` | Admin | Activate/deactivate without deleting the profile or diet history |
| `POST /api/patients/:id/temporary-password` | Admin | Rotate password and return it once |
| `GET /api/me` | Authenticated | Return the caller's application profile and access state |
| `PUT /api/me/password` | Authenticated, including forced-change session | Change password and clear `must_change_password` |
| `GET /api/me/active-diet` | Active student after required password change | Return only the caller's active diet tree |
| `GET /api/patients/:id/diets` | Admin | Return diet/version history |
| `POST /api/patients/:id/diets` | Admin | Create a draft diet |
| `GET /api/diets/:id` | Admin owner of operation or owning student for active diet | Return a nested diet tree |
| `PUT /api/diets/:id` | Admin | Update a draft diet |
| `POST /api/diets/:id/activate` | Admin | Atomically activate a draft and archive the prior active diet |
| `POST /api/diets/:id/archive` | Admin | Archive a draft |

For each request, derive identity from the verified Supabase token. Never trust a client-supplied role, student ID, or ownership claim. The student active-diet endpoint must derive the student ID from the token/profile.

Draft creation and updates validate the complete nested payload in the Function and persist the diet tree through one PostgreSQL RPC transaction. Array order determines meal, group, and option ordering. Limits are 20 meals per diet, 20 groups per meal, 10 options per group, and 200 options per diet; every meal and group must contain at least one child. The RPC is executable only by `service_role`; the Function requires an active `ADMIN` before invoking it. Updates lock the diet row and reject any status other than `DRAFT`, so an active diet cannot be overwritten by a draft edit.

The admin history endpoint returns versions for the requested student only. Activation verifies the selected draft belongs to that student, serializes activations by locking the student profile, then archives the prior active diet and activates the draft inside one PostgreSQL transaction. If either update fails, the transaction rolls back both changes. The partial unique index remains a final database invariant allowing at most one active diet per student.

## 7. Frontend Architecture

- Keep route definitions and session provider in `src/App.jsx` and `src/context/`.
- Add `AdminLayout` and `StudentLayout`; keep authentication screens in `AuthLayout`.
- Add small reusable inputs, selects, status badges, confirmation dialog, and one-time credential display.
- Place request code in `src/services/`; centralize API errors and bearer-token attachment in `apiClient.js`.
- The admin area needs a patient list/form and a diet editor. The student area needs a read-only active diet page.
- Meal editing must support add/remove/reorder operations and food options A/B/C without exposing clinical guidance or auto-generated recommendations.
- The current draft editor creates a draft and can update it during the same editor session. Resuming an already-saved draft after leaving/reloading requires the planned `GET /api/diets/:id` read endpoint; it is not part of the current draft-write API.
- The nutritionist can review patient diet versions and activate an eligible draft. The activation RPC serializes transitions for each student and archives the prior active version in the same transaction.
- Keep all feedback visible and accessible; never treat an API error as an empty successful result.
- Language and date/number formatting use `pt-BR`.

## 8. Environment and Deployment

Expected server-side Netlify environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side functions only)

Expected build-time public frontend configuration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The anon key is public and is safe only with correct RLS. Never place the service-role key in a `VITE_*` variable. Configure production variables in the Netlify dashboard, apply migrations to Supabase, and deploy the Vite build plus Functions from the same repository.

## 9. Verification Strategy

- Unit-test temporary password generation, input validation, and diet calculations/formatters as they are introduced.
- Function tests must cover unauthenticated access, non-admin access to admin endpoints, student ownership, inactive accounts, forced password changes, one-time credential responses, and activation transaction behavior.
- RLS integration tests must prove a student cannot read another profile/diet or write any diet row.
- Frontend tests must cover login, forced password change, student diet empty/error states, and admin create/reset one-time display.
- Run a production build and verify deployment redirects and functions on a Netlify preview before release.

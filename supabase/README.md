# Supabase profiles migration

The initial migration creates `public.profiles` and `public.student_details`.
It does not create Auth users, profiles, passwords, or other personal data.

The ownership migration adds `profiles.nutritionist_id`, assigns existing
students to the sole active nutritionist, and creates `nutritionist_details`
for the nutritionist's WhatsApp number. Existing students are assigned only
when exactly one active nutritionist exists; otherwise the migration stops and
requires an explicit ownership decision instead of guessing.

## Provision the first nutritionist

1. In the Supabase Dashboard, create the nutritionist's Auth user using the
   intended account and a unique, securely delivered password. Do not put the
   password in this repository, SQL, logs, or application configuration.
2. Copy that Auth user's UUID from the Dashboard.
3. As a trusted project administrator, run this statement in the Dashboard SQL
   Editor, replacing both placeholders with the intended user's UUID and name:

   ```sql
   INSERT INTO public.profiles (id, full_name, role)
   SELECT id, '<FULL_NAME>', 'ADMIN'
   FROM auth.users
   WHERE id = '<AUTH_USER_UUID>'::uuid;
   ```

   Confirm that exactly one row was inserted. The Auth user must already exist.
   This privileged provisioning step cannot be performed through the
   `authenticated` role: clients have no policy to insert an admin profile, and
   the admin policy only permits inserting `STUDENT` profiles.

## Apply and validate migrations

Use a local Supabase project with the Supabase CLI and Docker; do not point
validation commands at production:

```powershell
supabase start
supabase db reset
supabase migration list --local
supabase db lint
```

`db reset` applies the checked-in migrations to the local database. Review that
the migration is listed and lint completes without SQL errors.

## Validate RLS

Use disposable Auth users in the local project: one admin and at least two
students. Provision the admin profile as described above. With the users'
existing Auth UUIDs, create student profiles while acting as that admin:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<ADMIN_UUID>', true);
INSERT INTO public.profiles (id, full_name, role, nutritionist_id)
VALUES ('<STUDENT_A_UUID>', 'Synthetic Student A', 'STUDENT', '<ADMIN_UUID>');
INSERT INTO public.profiles (id, full_name, role, nutritionist_id)
VALUES ('<STUDENT_B_UUID>', 'Synthetic Student B', 'STUDENT', '<ADMIN_UUID>');
ROLLBACK;
```

For lasting test fixtures in the disposable local project, use `COMMIT` instead
of `ROLLBACK`. Do not use production identities, personal data, or credentials.

In a separate transaction, simulate each user's JWT subject while using the
`authenticated` database role:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<STUDENT_A_UUID>', true);
SELECT id, role FROM public.profiles;
SELECT user_id, phone FROM public.student_details;
SELECT set_config('request.jwt.claim.sub', '<STUDENT_B_UUID>', true);
SELECT id, role FROM public.profiles;
SELECT set_config('request.jwt.claim.sub', '<ADMIN_UUID>', true);
SELECT id, role FROM public.profiles;
ROLLBACK;
```

Each student should see only their own profile and details; the admin should see
their own profile and assigned students. A student can also read the profile
and WhatsApp details of their assigned nutritionist. To verify admin management, use a
separate transaction with the admin subject to insert and update student
profiles and details, then roll back. Permanent deletion is intentionally not
granted; deactivate a student instead to preserve history.

To validate tenant isolation, create a second active admin and a student
assigned to that admin. Each admin must see, update, and manage diets only for
students whose `nutritionist_id` matches their own UUID. Test both direct RLS
reads and the Netlify patient/diet endpoints; the endpoints use `service_role`,
so they perform explicit ownership checks independently of RLS.

In separate transactions, verify that a student cannot insert a profile or
update the `role` column (no insert policy and no column privilege), and that
an admin cannot insert a profile with `role = 'ADMIN'` (the RLS check rejects
it). Roll back each test transaction. Inspect policy names and RLS enablement
with:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'student_details')
ORDER BY tablename, policyname;

SELECT relname, relrowsecurity
FROM pg_class
WHERE oid IN (
  'public.profiles'::regclass,
  'public.student_details'::regclass
);
```

The SQL checks above describe local verification steps; they do not imply that
this migration has been applied to or tested against a hosted Supabase project.

## Atomic diet operations

The migrations add privileged PostgreSQL RPCs:

- `20261110160000_add_atomic_draft_diet_rpc.sql` defines
  `public.save_draft_diet(uuid, uuid, jsonb)`. It creates or replaces the
  complete nested draft tree in one transaction, preserves array ordering, and
  rejects updates when the target diet is no longer a draft.
- `20261110170000_add_atomic_diet_activation.sql` defines
  `public.activate_draft_diet(uuid, uuid)`. It validates the student/draft
  relationship, locks the student's profile, archives the previous active
  version, and activates the selected draft in one transaction.
- `20261110194500_add_save_diet_workflow.sql` defines
  `public.save_diet(uuid, uuid, jsonb)`. Creating a diet activates it in the
  same transaction and archives any previous active version. Editing a draft
  updates it without activation; editing an active or archived version creates
  a new draft version, leaving the source unchanged until the nutritionist
  activates the new version manually. The admin API also uses
  `save_draft_diet` to duplicate a diet as a new, inactive draft; the source
  remains unchanged. Diet deletion is restricted to the assigned nutritionist
  and removes the diet tree through the existing cascading foreign keys.

All three functions revoke execution from `PUBLIC`, `anon`, and `authenticated`
and grant it only to `service_role`. The Netlify handlers first authenticate and
authorize the nutritionist, validate input/ownership, then invoke the RPCs.
Never expose these RPCs to browser callers or grant execution to
`authenticated`.

After applying migrations to a disposable local Supabase project, verify the
RPCs exist and that only `service_role` can execute them:

```sql
SELECT
  has_function_privilege('anon', 'public.save_draft_diet(uuid, uuid, jsonb)', 'EXECUTE')
    AS anon_can_save_draft,
  has_function_privilege('authenticated', 'public.save_draft_diet(uuid, uuid, jsonb)', 'EXECUTE')
    AS authenticated_can_save_draft,
  has_function_privilege('service_role', 'public.save_draft_diet(uuid, uuid, jsonb)', 'EXECUTE')
    AS service_role_can_save_draft,
  has_function_privilege('authenticated', 'public.save_diet(uuid, uuid, jsonb)', 'EXECUTE')
    AS authenticated_can_save_diet,
  has_function_privilege('service_role', 'public.save_diet(uuid, uuid, jsonb)', 'EXECUTE')
    AS service_role_can_save_diet,
  has_function_privilege('authenticated', 'public.activate_draft_diet(uuid, uuid)', 'EXECUTE')
    AS authenticated_can_activate,
  has_function_privilege('service_role', 'public.activate_draft_diet(uuid, uuid)', 'EXECUTE')
    AS service_role_can_activate;
```

Expected results are `false`, `false`, `true`, `false`, `true`, `false`, and
`true`. Then use the admin Function endpoints with disposable users to create
an active diet, edit active and archived versions into drafts, manually activate
a draft, read back the ordered tree, and confirm exactly one diet is active.
The local automated
Function tests use mocked Supabase clients; they do not execute these SQL
functions or prove RLS behavior against a running database.

## Inactive student access

The migration `20261110150000_block_inactive_student_reads.sql` tightens the
profile and student-detail read policies. An inactive student cannot use an
existing authenticated token to read their profile, contact details, or diet
tree through Supabase. The application login also verifies `is_active` through
`GET /api/me` and rejects inactive accounts. Deactivation changes only
`profiles.is_active`; it does not delete the Auth identity, profile, details,
or diet history.

Validate locally after applying migrations: set an inactive test student's JWT
subject and confirm queries against `profiles`, `student_details`, and `diets`
return no rows. Restore the student's active state and verify their own rows
become available again; another student's rows must remain inaccessible.
These are local validation steps and do not claim a hosted Supabase test.

## Diet and meal migration

The next migration adds `diets`, `meals`, `food_groups`, and `food_options`.
Apply it to the local Supabase project with the same `supabase db reset`,
`supabase migration list --local`, and `supabase db lint` commands above.
Never use production credentials for local validation.

With disposable Auth users and the local admin/student profiles, verify RLS by
simulating each identity as described above:

- Each admin can insert, read, update, and delete diet content only for assigned
  students. A diet must
  reference a profile whose database role is `STUDENT`; the role is checked
  from `profiles`, not accepted from request data.
- Student A can select only their own `ACTIVE` diet and its meals, food groups,
  and options. Student B cannot read A's diet tree.
- A student cannot insert, update, or delete rows in any of the four tables.
- An inactive student, or a student whose `must_change_password` is true, sees
  no diet tree.
- Attempting to create a second `ACTIVE` diet for the same student fails the
  `diets_one_active_per_student_idx` unique index. Another student may have an
  active diet.
- Invalid statuses, negative quantities/macros, blank required names, and
  duplicate order indexes are rejected by constraints.

Use separate transactions for checks expected to fail, then roll them back.
Inspect the registered policies and RLS flags with:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('diets', 'meals', 'food_groups', 'food_options')
ORDER BY tablename, policyname;

SELECT relname, relrowsecurity
FROM pg_class
WHERE oid IN (
  'public.diets'::regclass,
  'public.meals'::regclass,
  'public.food_groups'::regclass,
  'public.food_options'::regclass
);
```

These are local validation instructions only; they do not assert that the
migration or policies have been tested against Supabase.

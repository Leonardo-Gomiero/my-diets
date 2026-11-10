# Supabase profiles migration

The initial migration creates `public.profiles` and `public.student_details`.
It does not create Auth users, profiles, passwords, or other personal data.

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
INSERT INTO public.profiles (id, full_name, role)
VALUES ('<STUDENT_A_UUID>', 'Synthetic Student A', 'STUDENT');
INSERT INTO public.profiles (id, full_name, role)
VALUES ('<STUDENT_B_UUID>', 'Synthetic Student B', 'STUDENT');
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
their own profile and student profiles. To verify admin management, use a
separate transaction with the admin subject to insert and update student
profiles and details, then roll back. Permanent deletion is intentionally not
granted; deactivate a student instead to preserve history.

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

## Diet and meal migration

The next migration adds `diets`, `meals`, `food_groups`, and `food_options`.
Apply it to the local Supabase project with the same `supabase db reset`,
`supabase migration list --local`, and `supabase db lint` commands above.
Never use production credentials for local validation.

With disposable Auth users and the local admin/student profiles, verify RLS by
simulating each identity as described above:

- The admin can insert, read, update, and delete diet content. A diet must
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

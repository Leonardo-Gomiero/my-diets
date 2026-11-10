# MVP Implementation Tasks

## Phase 1: Supabase and Security Foundation

- [ ] **DB-01**: Create the Supabase project and configure local/deployment environment variables without committing secrets.
- [ ] **DB-02**: Add versioned SQL migrations for `profiles`, `student_details`, `diets`, `meals`, `food_groups`, and `food_options`, including constraints, indexes, and timestamps.
- [ ] **DB-03**: Enable RLS on every application table and add admin/student policies for profile, student, and active-diet access.
- [ ] **DB-04**: Document and verify secure provisioning of the first nutritionist account; do not seed default credentials.
- [ ] **DB-05**: Add database/RLS tests for cross-student isolation, inactive accounts, and role restrictions.

## Phase 2: Netlify Functions and Authentication

- [ ] **BE-01**: Configure Netlify Functions, `/api/*` redirects, and shared Supabase clients using server-only secrets where required.
- [ ] **BE-02**: Implement shared bearer-token verification, profile lookup, active-account check, role guard, forced-password-change guard, input validation, and consistent error responses.
- [ ] **BE-03**: Connect the frontend login/logout flow to Supabase Auth and load the application profile.
- [ ] **BE-04**: Implement the forced password-change flow; block all other application data access until the password and profile flag are updated successfully.
- [ ] **BE-05**: Implement cryptographically secure temporary-password generation.
- [ ] **BE-06**: Implement admin-only patient creation and temporary-password rotation; return the password once, enforce `must_change_password`, and handle partial failures/orphaned users safely.
- [ ] **BE-07**: Add tests proving temporary passwords are not persisted, logged, or returned by subsequent reads.

## Phase 3: Shared Frontend Foundation

- [ ] **FE-01**: Add `apiClient.js` with token attachment, consistent JSON handling, and explicit error propagation.
- [ ] **FE-02**: Add role-aware protected routes and `AdminLayout`/`StudentLayout`.
- [ ] **FE-03**: Build reusable labeled inputs, selects, buttons, status badges, confirmation dialog, and loading/error/empty states using the existing CSS conventions.
- [ ] **FE-04**: Set application copy, validation messages, and date/number formatting to Brazilian Portuguese.
- [ ] **FE-05**: Verify keyboard interaction, focus visibility, semantic labels, and responsive foundations.

## Phase 4: Student Administration

- [ ] **FE-06**: Build the admin student list with search, status, and create/edit actions.
- [ ] **FE-07**: Build student create/edit form for full name, email, optional phone, and active status.
- [ ] **FE-08**: Build the one-time temporary-password result view with copy action and clear close/loss warning; do not keep the password after leaving the view.
- [ ] **FE-09**: Add student deactivation/reactivation and confirm that deactivation preserves historical diets.
- [ ] **BE-08**: Implement and test admin-only student list/detail/update/status endpoints with server-side validation.

## Phase 5: Diet Authoring and Student View

- [ ] **BE-09**: Implement draft diet creation/update and nested meal, food-group, and food-option persistence.
- [ ] **BE-10**: Implement diet history and atomic activation/archive behavior, enforcing no more than one active diet per student.
- [ ] **BE-11**: Implement the active-diet endpoint scoped to the authenticated student and the complete read path for admin preview/history.
- [ ] **FE-10**: Build the draft diet editor for title, notes, targets, meals, schedule, food groups, options, quantity, unit, and optional nutrition values.
- [ ] **FE-11**: Build diet preview, version history, draft editing, and activation confirmation for the nutritionist.
- [ ] **FE-12**: Build the student read-only active diet page with macros, meal ordering, options, and notes.
- [ ] **FE-13**: Add student empty, loading, and recoverable error states; verify no editing controls are exposed to students.

## Phase 6: Integration and Release Readiness

- [ ] **QA-01**: End-to-end test: nutritionist creates a student, shares the one-time password, student changes it, and student sees only their own active diet.
- [ ] **QA-02**: End-to-end test: nutritionist resets a password; the prior password no longer works and the new password requires a change.
- [ ] **QA-03**: Verify unauthorized roles, inactive accounts, forced-change sessions, and cross-student access are rejected by the API and RLS.
- [ ] **QA-04**: Verify the student experience at 320px and desktop widths and check WCAG AA contrast/focus behavior.
- [ ] **QA-05**: Run the production build and test environment variables, redirects, migrations, and Functions in a Netlify preview.
- [ ] **OPS-01**: Document deployment, migration, first-admin provisioning, environment variables, free-tier constraints, and recovery procedures.

## Deferred After MVP

- [ ] **NEXT-01**: Evaluate meal-completion tracking, free-meal allowances, PDF export, offline access, and detailed student health records with the nutritionist before adding them.
- [ ] **NEXT-02**: Revisit multi-nutritionist tenancy and database isolation before offering the application to additional clinics.

# Product & Functional Specification: My Diets MVP

## 1. Purpose and Scope

My Diets is a responsive web application for one nutritionist to manage students and their diet plans. Each student signs in and can consult only their own active plan.

The application is a single repository deployed to Netlify. Netlify hosts the React frontend and serverless API functions; Supabase provides PostgreSQL and managed authentication. The initial release supports one nutritionist account and is not a multi-tenant SaaS product.

The interface and user-facing messages are in Brazilian Portuguese (`pt-BR`). The application must work at screen widths down to 320px.

### MVP includes

- Nutritionist sign-in and protected administration.
- Student creation, listing, editing, deactivation, and temporary-password reset.
- One-time display of generated temporary passwords to the nutritionist.
- Required password change on a student's first sign-in and after every admin reset.
- Diet creation, editing, activation, history, and archive.
- Read-only student access to their own active diet, including meals and food substitutions.
- Responsive layouts, loading/empty/error states, and accessible forms.

### Explicitly out of scope for the MVP

- Multiple nutritionists, clinics, or tenant billing.
- Meal-completion checklists, adherence logs, and free-meal allowance tracking.
- PDF export, offline diet storage, and push/email notifications.
- Detailed medical records, measurements, allergies, and progress tracking.
- Student editing of profiles or diets and self-service student password recovery.
- Personal-trainer role.

## 2. Roles and Permissions

### Nutritionist (`ADMIN`)

- Sign in and sign out.
- List, search, create, and edit student accounts.
- Deactivate/reactivate a student without deleting their diet history.
- Create a new temporary password for a student account.
- Create and edit draft diets, review prior versions, activate a diet, and archive drafts.
- View a student's profile and diet history.

### Student (`STUDENT`)

- Sign in with the email and temporary password provided by the nutritionist.
- Set a new password before accessing any other application feature on first sign-in or after a reset.
- View their own profile basics and currently active diet.
- Read meals, schedules, notes, nutrition totals, food items, and substitution options.
- Sign out.

Students cannot select another student, access administration screens, alter a diet, or read another student's data. Viewing substitution options is read-only and does not change the prescribed plan.

## 3. Authentication and Temporary Credentials

Supabase Auth is the source of truth for passwords and authenticated sessions. The application must not store plaintext passwords or implement its own password hashing.

### Creating a student

1. The nutritionist enters the student's name and email address.
2. The server generates a cryptographically random temporary password and creates the Supabase Auth account.
3. The server creates a student profile with `must_change_password = true`.
4. The generated password is returned once in the successful create response and shown in a copyable, clearly identified one-time screen.
5. The nutritionist shares it with the student outside the application (for example, in person or through their existing messaging channel).
6. The application does not send the password by email, retain it for later display, or include it in logs, analytics, URLs, or browser storage.
7. If the screen is closed or the password is lost, the nutritionist must generate a new one.

The nutritionist is responsible for entering the correct email address. Student email confirmation is not part of this MVP.

### First sign-in and password reset

- A student with `must_change_password = true` may access only the password-change flow and sign-out.
- A successful password change updates the Supabase Auth password and clears the profile flag. Access to the diet is granted only after both operations succeed.
- A nutritionist reset first blocks normal access, replaces the existing password in Supabase Auth, verifies `must_change_password = true`, and returns the new temporary password once. If any step after the access lock is uncertain, the server must not reveal the password and must leave the account blocked for a safe retry.
- A reset password is never recoverable from the application after the one-time response. If the nutritionist loses it, they must reset it again.
- Students have no self-service password-reset flow in this release.
- The nutritionist's own account is provisioned and recovered operationally through Supabase Auth; the application must not ship a shared or hard-coded admin credential.

## 4. Student Management

### Student profile

Required fields:

- Full name.
- Email address.
- Account status (`ACTIVE` or `INACTIVE`).

The profile may include an optional phone number. Detailed health information is intentionally excluded from the MVP.

### Business rules

- Email addresses must be unique and normalized consistently.
- Inactive students cannot sign in to the application or retrieve any data; server checks and RLS enforce this even when an existing token is presented.
- Deactivation preserves the account reference and all diet history.
- Permanent deletion is not available in the MVP.
- Only the nutritionist can create and edit student accounts or change their status.

## 5. Diet Management

### Diet version

Each diet belongs to exactly one student and contains:

- Title, version number, status (`DRAFT`, `ACTIVE`, `ARCHIVED`), and general notes.
- Optional daily target totals: calories, protein, carbohydrates, and fats.
- An ordered list of meals.

Only one diet per student may be active at a time. Activating a draft archives the previously active version in the same operation. Draft edits do not change the student's current active diet. An active diet must be copied into a new draft/version before the nutritionist makes changes that should not immediately affect the student.

Activation must verify that the selected draft belongs to the expected student. Archiving the prior active version and activating the selected draft are one database transaction; on any failure both changes roll back and the prior active version remains active.

### Meals and food options

- A diet has one or more ordered meals.
- A meal has a name, optional scheduled time, optional target calories, and optional notes.
- A meal has ordered food/substitution groups.
- Each group has one or more options (for example, Opção A, B, or C). Each option contains a food name, quantity, unit, optional nutrition values, and optional notes.
- The nutritionist is responsible for ensuring that substitutions are appropriate and nutritionally equivalent; automatic nutrient equivalence validation is not part of the MVP.

Nutrition values are entered and displayed as provided. The MVP does not calculate clinical recommendations or replace professional judgment.

## 6. Student Diet Experience

- After authentication and any required password change, the student is taken directly to their active diet.
- The page displays the student's name, active diet title, general notes, daily nutrition targets when present, and meals in order.
- Students can inspect the options within each food group but cannot edit or save changes.
- If no active diet exists, show a clear empty state asking the student to contact their nutritionist.
- Loading and API failures must have visible feedback and a retry path where retry is safe.
- Data requests must be scoped to the authenticated student on the server/database, not merely filtered in the UI.

## 7. Security and Non-Functional Requirements

- Enforce authentication, role checks, account status, first-login password change, and student ownership on the server and in Supabase Row Level Security (RLS).
- The Supabase service-role key is server-only and must never be exposed in a `VITE_*` variable or browser bundle.
- Client-side route guards improve navigation but are not an authorization boundary.
- Never return student records or diets outside the caller's role and ownership scope.
- Do not log temporary passwords, access tokens, or password-reset response bodies.
- Validate and constrain all input on the server; return explicit, non-sensitive errors.
- Use HTTPS in production and secure environment variables in Netlify and Supabase.
- Support keyboard navigation, visible focus, semantic form labels, and WCAG AA contrast.
- Provide loading, empty, success, and error states for asynchronous screens.
- Free-tier availability, quotas, inactivity policies, and backup guarantees depend on Supabase and Netlify and must not be presented as an application SLA.

## 8. MVP Acceptance Criteria

1. A visitor cannot access student or nutritionist data without signing in.
2. The nutritionist can create a student; the generated temporary password is shown once and is not available on a later page load or API read.
3. The student must choose a new password before any diet or profile data is accessible.
4. A nutritionist password reset invalidates the old password, returns a new one-time password, and again requires a password change.
5. A student can retrieve only their own active diet; inactive students and students without an active diet receive the appropriate blocked/empty state.
6. Activating a new version atomically archives the previous active diet for that student.
7. The nutritionist can manage drafts without changing what the student currently sees.
8. Student screens are usable at 320px and do not expose editing or admin controls.
9. Automated tests cover role, ownership, inactive-account, and forced-password-change boundaries.

# NetraOS Supabase setup

The browser client is configured for project `nqacreyemzoiarnaaska`. The publishable key is intentionally visible in `supabase-config.js`; it is safe to expose only because the database schema applies Row Level Security. Never put a Supabase `service_role` key in any browser file.

## 1. Create the database tables

1. Open the project at [Supabase Dashboard](https://supabase.com/dashboard/project/nqacreyemzoiarnaaska).
2. Open **SQL Editor** and create a new query.
3. Copy all of `supabase/schema.sql` into the query editor and click **Run**.
4. Confirm the tables appear in **Table Editor** and that Row Level Security is enabled for each.

If you previously applied `supabase/migrations/20261015_require_totp_aal2.sql`, run `supabase/migrations/20261015_remove_totp_aal2.sql` in the SQL Editor to restore the standard owner-only policies without an MFA requirement.

The schema stores profile data in `user_profiles`, settings in `user_settings`, and financial records in the individual tables. Supabase Auth owns password hashes, confirmation challenges, password recovery, and session tokens, so those secrets are not duplicated in app tables. The inactivity PIN remains a device-side convenience and is never uploaded.

## 2. Configure Auth URLs and email

In **Authentication → URL Configuration**:

- Set **Site URL** to `https://xivvix988.github.io/NetraOS-APP/`.
- Add `https://xivvix988.github.io/NetraOS-APP/**` to **Redirect URLs**.
- Signup confirmation now returns to `https://xivvix988.github.io/NetraOS-APP/?auth=confirm`, then clears the confirmation session and opens the login page.
- Keep local development working by also adding `http://127.0.0.1:5500/**` and, if used, `http://localhost:5500/**`.

Signup confirmation and password recovery now return to the published GitHub Pages app. For signups started from the local preview, confirmation still returns to GitHub Pages so users complete authentication on the published app.

Keep email confirmation enabled. Supabase’s default email sender is best-effort and limited to two emails per hour; on newer free projects it may only deliver to addresses belonging to the project organization. Configure custom SMTP under **Authentication → Emails → SMTP Settings** before inviting ordinary users or launching publicly.

## 3. Serve the app

Use a local web server such as VS Code Live Server at port `5500`; do not open `index.html` as a `file://` URL. Keep `index.html`, `scrip.js`, `style.css`, `supabase-config.js`, `supabase-sync.js`, the SVG assets, and `manifest.webmanifest` together in the same app directory. The SQL file is for the Dashboard only.

## 4. Check the first sync

1. Reload `http://127.0.0.1:5500/index.html` and create an account with an email you can open.
2. Follow the Supabase confirmation link. NetraOS keeps the confirmed Supabase session and opens the dashboard automatically; if Supabase doesn’t return a session, sign in with your email and password.
3. If this browser already has NetraOS records, accept the import prompt. A local migration backup is retained until the upload finishes successfully.
4. Add a test record and verify it appears in the matching table in Supabase **Table Editor**.
5. Sign in on another browser/device and check that the account data downloads there.

The app writes locally first and retries cloud sync after connectivity returns. It pulls remote changes every 30 seconds when there are no pending local edits. Rows created on another device since the last pull are merged; for simultaneous edits to the same row, the last successful save wins. JSON/CSV export stays available. **Factory reset** clears the account’s NetraOS database rows and local app data, but leaves the Supabase Auth identity in place.

## Items that still need configuration before production

- Email-based PIN recovery is disabled in connected mode until that server-side challenge function exists. The current inactivity PIN is local to each device and is not server-verified.
- Factory reset deletes account data but does not delete the Supabase Auth identity. Deleting the identity safely needs a protected server function; never use a service-role key from the browser.
- Confirm the project’s database region, retention, backups, email settings, and production redirect domain in the Supabase Dashboard.

For the second-factor setup, choose a transactional sender (for example Resend or Brevo) and a verified sender address. Add its API secret directly in Supabase Edge Function secrets; do not send that secret in chat or add it to `supabase-config.js`.

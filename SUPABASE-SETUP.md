# NetraOS Supabase setup

The browser client is configured for project `nqacreyemzoiarnaaska`. The publishable key is intentionally visible in `js/supabase-config.js`; it is safe to expose only because the database schema applies Row Level Security. Never put a Supabase `service_role` key in any browser file.

## 1. Create the database tables

1. Open the project at [Supabase Dashboard](https://supabase.com/dashboard/project/nqacreyemzoiarnaaska).
2. Open **SQL Editor** and create a new query.
3. Copy all of `supabase/schema.sql` into the query editor and click **Run**.
4. Confirm the tables appear in **Table Editor** and that Row Level Security is enabled for each.

When updating an existing setup, rerun the current `supabase/schema.sql` to add the PIN table and RPC functions. The factory-reset RPC is required by the app’s connected-mode reset flow.

If you previously applied `supabase/migrations/20261015_require_totp_aal2.sql`, run `supabase/migrations/20261015_remove_totp_aal2.sql` in the SQL Editor to restore the standard owner-only policies without an MFA requirement.

The schema stores profile data in `user_profiles`, settings in `user_settings`, and financial records in the individual tables. Supabase Auth owns password hashes, confirmation challenges, password recovery, and session tokens. The local PIN verifier stays on each device; when online, a bcrypt hash in `user_pins` adds account-level verification and a five-attempt, five-minute lockout. Older PINs remain local until the PIN is changed while signed in and online. The new `wipe_my_data()` RPC removes all NetraOS account rows in one transaction while preserving the Supabase Auth identity.

## 2. Deploy permanent account deletion

Settings includes a separate **Delete account permanently** action. It verifies the signed-in user, then calls the `delete-account` Edge Function to remove that user from Supabase Auth. The database rows reference `auth.users` with `ON DELETE CASCADE`, so the account’s synced NetraOS records are removed with the identity. The function uses `SUPABASE_SERVICE_ROLE_KEY` only in the Edge Function environment; never put that key in browser code.

Deploy `supabase/functions/delete-account` to the same project with the Supabase CLI (`supabase functions deploy delete-account`). Confirm the Edge Function environment has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` set. Keep JWT verification enabled for the function. Permanent deletion will report that it is not configured until this function is deployed.

## 3. Configure Auth URLs and email

In **Authentication → URL Configuration**:

- Set **Site URL** to `https://xivvix988.github.io/NetraOS-APP/`.
- Add `https://xivvix988.github.io/NetraOS-APP/**` to **Redirect URLs**.
- Signup confirmation now returns to `https://xivvix988.github.io/NetraOS-APP/?auth=confirm` and opens the dashboard using the verified session.
- Password reset links return to `https://xivvix988.github.io/NetraOS-APP/?auth=recovery`, where the verified recovery session opens the new-password form.
- Keep local development working by also adding `http://127.0.0.1:5500/**` and, if used, `http://localhost:5500/**`.

Signup confirmation and password recovery now return to the published GitHub Pages app. For signups started from the local preview, confirmation still returns to GitHub Pages so users complete authentication on the published app.

### Enable Google, Facebook, and Apple sign-in

The login and signup forms include a **Continue with Google** button. To enable it:

1. In Google Cloud, create an OAuth client with application type **Web application**. Add `https://xivvix988.github.io` as an authorized JavaScript origin. For local browser development, also add `http://127.0.0.1:5500` and/or `http://localhost:5500`.
2. In the Supabase Dashboard, open **Authentication → Sign In / Providers → Google**, enable Google, and enter the Google client ID and client secret.
3. Copy the callback URL shown in Supabase’s Google provider settings into the Google OAuth client’s **Authorized redirect URIs**. This is the Supabase Auth callback, not the GitHub Pages app URL.
4. Confirm the app URL and local development URLs above are in Supabase **Authentication → URL Configuration → Redirect URLs**.

For Facebook sign-in, create a Facebook app with Facebook Login enabled. In the Facebook Login settings, add the Supabase callback URL shown in the Supabase Facebook provider settings to **Valid OAuth Redirect URIs**. Then enable Facebook under Supabase **Authentication → Sign In / Providers → Facebook** and enter the Facebook App ID and App Secret. Keep the app secret in Supabase only. The app’s signup page requires the existing Terms checkbox before starting Google or Facebook signup; the login page does not show that checkbox.

For Apple sign-in, configure Sign in with Apple in Apple Developer and add the callback URL shown in the Supabase Apple provider settings to the Apple service configuration. Enable Apple under Supabase **Authentication → Sign In / Providers → Apple** and enter the requested Apple identifiers and signing key details there. Keep private keys in Supabase only. The Google option is the only full-size provider button; Facebook and Apple appear as text links.

Keep the Google client secret in the Supabase Dashboard; do not put it in `js/supabase-config.js` or another browser file. Google sign-in requires an internet connection and redirects back to the app after authentication.

### Enable fingerprint and passkey sign-in

NetraOS supports Supabase Passkeys, an experimental Supabase Auth feature. A passkey can prompt Windows Hello (including a fingerprint reader), a device PIN, or a security key; the exact prompt depends on the device. Users add a passkey from **Settings → Security** after signing in, then choose **Use a passkey / fingerprint** on the login page.

Before using it, open **Authentication → Passkeys** in the Supabase Dashboard and enable passkey authentication. Set the relying party display name to `NetraOS`, the relying party ID to `xivvix988.github.io`, and the allowed origin to `https://xivvix988.github.io`. Keep this relying party ID stable after users register passkeys; changing it invalidates existing credentials. Passkeys require HTTPS (the published site uses HTTPS). The desktop app loads the same hosted origin.

Passkey support is experimental in Supabase Auth. Existing email/password and Google sign-in remain available. The app uses `@supabase/supabase-js` 2.105.0, which includes the passkey client API.

Keep email confirmation enabled. Supabase’s default email sender is best-effort and limited to two emails per hour; on newer free projects it may only deliver to addresses belonging to the project organization. Configure custom SMTP under **Authentication → Emails → SMTP Settings** before inviting ordinary users or launching publicly.

## 4. Serve the app

Use a local web server such as VS Code Live Server at port `5500`; do not open `index.html` as a `file://` URL. Keep `index.html` and `manifest.webmanifest` in the app root, browser scripts in `js/`, stylesheets in `css/`, and image or logo files in `assets/`. The SQL file is for the Dashboard only.

## 5. Check the first sync

1. Reload `http://127.0.0.1:5500/index.html` and create an account with an email you can open.
2. Follow the Supabase confirmation link. NetraOS keeps the confirmed Supabase session and opens the dashboard automatically; if Supabase doesn’t return a session, sign in with your email and password.
3. If this browser already has NetraOS records, accept the import prompt. A local migration backup is retained until the upload finishes successfully.
4. Add a test record and verify it appears in the matching table in Supabase **Table Editor**.
5. Sign in on another browser/device and check that the account data downloads there.

The app writes locally first and retries cloud sync after connectivity returns. It pulls remote changes every 30 seconds when there are no pending local edits. Rows created on another device since the last pull are merged; for simultaneous edits to the same row, the last successful save wins. JSON/CSV export stays available. **Factory reset** clears the account’s NetraOS database rows and local app data, but leaves the Supabase Auth identity in place.

The service worker caches the app shell and public render assets after the first successful online load, so the installed site can reopen offline. Existing local records and a PIN configured on that device remain available offline. Supabase sign-in, account recovery, cloud sync, and other server-backed requests still require connectivity; API responses and financial records are not cached by the service worker. Google Fonts and the Supabase client library use their last cached static assets when available, with system-font fallbacks if they are not.

## Items that still need configuration before production

- Email-based PIN recovery is disabled in connected mode until that server-side challenge function exists. PIN verification uses the account-side lockout when the RPC is installed and the device is online; the local verifier remains available for offline unlocks on devices that have their own PIN.
- Factory reset deletes account data but does not delete the Supabase Auth identity. Deleting the identity safely needs a protected server function; never use a service-role key from the browser.
- Confirm the project’s database region, retention, backups, email settings, and production redirect domain in the Supabase Dashboard.

For the second-factor setup, choose a transactional sender (for example Resend or Brevo) and a verified sender address. Add its API secret directly in Supabase Edge Function secrets; do not send that secret in chat or add it to `js/supabase-config.js`.

## 6. Stage 3A push registration (local preparation only)

Stage 3A adds authenticated device registration and consent storage. It does not send notifications and does not add a push handler to the service worker. Keep the existing root `service-worker.js` registration and offline cache unchanged.

Before enabling the Settings control, configure the **public Firebase Web app values** in `js/register-service-worker.js`: `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId`, and the public Web Push certificate key (`vapidKey`). These values identify the public Firebase Web app; they are not Firebase Admin credentials. The repository currently has empty placeholders, so the browser registration control remains disabled until these values are supplied.

The Edge Functions require these Supabase secrets/environment values. Add them only through Supabase's local secret manager / Edge Function secret interface during a separately approved deployment; never commit actual values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only. Stage 3A uses it only in trusted Edge Functions to call RPCs whose execution is independently restricted to the signed `service_role` claim. Never put it in browser code, source control or GitHub Pages.
- `FIREBASE_APP_ID` — the expected public Firebase app identifier, held in the Edge Function environment and compared with the private database value.
- `PUSH_FID_HMAC_KEYS` — JSON object mapping key version to base64-encoded random key material (at least 32 random bytes per key). Kept only as an Edge Function secret. The Edge Function computes `lowercase-hex(HMAC-SHA-256(key, UTF-8("netraos:fid-fingerprint:v1\\0" + FID)))`; it never logs the FID, fingerprint or key.
- `PUSH_FINGERPRINT_ROTATION_JOB_SECRET` — a separate high-entropy secret used only by the internal `push-fingerprint-rekey` operator function. It is not a user credential and must not be exposed to the browser.

No Firebase service-account key or FCM send credential is required for Stage 3A. Sending credentials belong to a later delivery stage and must remain server-side.

Migrations are `supabase/migrations/20261118000100_push_devices.sql` and `supabase/migrations/20261118000200_push_stage3a_remediation.sql`. The second is forward-only: it closes authenticated execution of the old registration, opt-in and resume mutations; adds the versioned fingerprint keyring, rate records and operation bindings; and exposes Edge-only mutations. The browser may call only the user-scoped state/list/pause/revoke operations. Edge Functions independently validate the Supabase bearer with `/auth/v1/user`, derive the user ID from that response, then call server-only RPCs with the service credential. The database validates `auth.role() = 'service_role'` inside each definer RPC and checks Firebase app ID under the same transaction lock as mutation.

The HMAC keyring table stores version labels only; key bytes remain in `PUSH_FID_HMAC_KEYS`. For first setup, create a random key, assign a version such as `v1`, set the Edge secret, then use the database-owner-only `netra_private.provision_push_fingerprint_keyring('v1', ARRAY['v1'])`. This function has no execution grant to application or service roles. Provisioning writes an audit row. The initial keyring row is only a version placeholder and registration fails closed until the matching Edge secret exists.

The first Firebase app ID row starts disabled. A database owner provisions it through `netra_private.provision_push_firebase_app('<app-id>', false)`, sets matching Edge Function `FIREBASE_APP_ID`, confirms the private database and Edge setting agree, then enables with `netra_private.provision_push_firebase_app('<same-app-id>', true)`. For changes, disable at the database first, drain in-flight requests, update the Edge secret and private database configuration while disabled, verify equality, then enable. Mismatch fails closed. Pause/revoke remain available without Firebase configuration.

Key rotation uses two versions at once: add the new version to `PUSH_FID_HMAC_KEYS`, provision the keyring to accept both old and new, then invoke the internal bounded `push-fingerprint-rekey` worker repeatedly with the old/new version pair. It reads raw FIDs only inside the trusted Edge runtime, computes the new HMAC and writes fingerprints without returning FIDs. Verify the worker reports no more rows, call `push_edge_finalize_fid_rotation(new_version)` through the restricted trusted maintenance path, and only then remove the old secret. Do not delete old key material before the finalization check succeeds. A lost key makes fingerprints unrecoverable; affected devices must re-register or be revoked through account-authenticated recovery.

For a future configuration change, first disable push operations through the owner-only provisioning function and allow in-flight registration requests to drain. Update the Edge Function `FIREBASE_APP_ID`, update the database app ID while keeping push disabled, verify they match, then enable push operations. During the disabled interval, opt-in, resume and registration fail closed; pause and revocation remain available. The database serializes registration/config provisioning with a shared/exclusive advisory lock.

The functions are `push-register-device` and `push-device-lifecycle`. Both verify the user bearer token with Supabase Auth and measure request bodies by streamed bytes. Registration, opt-in, resume and recovery derive user identity from the verified Auth response and use restricted server RPCs; pause, revoke, state and device listing use the authenticated user's JWT and derive identity with `auth.uid()`. `push-fingerprint-rekey` is operator-only, rejects browser origins, and requires its dedicated secret. Browser request bodies never contain a user ID or app ID. The approved CORS allowlist is:

- `https://xivvix988.github.io`
- `http://127.0.0.1:5500`

`localhost:5500` is not included because the development setup documents it only conditionally. Add another exact origin only after confirming it is an actual development origin; do not use wildcards or broad localhost patterns.

Automated tests added for Stage 3A remediation:

- Run client, Edge request validation and SQL contract regression tests with `npm run test:push` (or `node --test tests/push-stage3a*.test.mjs`).
- Run database behavior tests against a disposable local Supabase database with `supabase test db`. The database test file is `supabase/tests/push_stage3a.test.sql`; it must not be run against production.
- The independent-session concurrency runner is `tests/push-stage3a-concurrency.test.mjs`. It refuses non-local database hosts and requires both `NETRAOS_PUSH_TEST_DISPOSABLE=1` and `NETRAOS_PUSH_TEST_DATABASE_URL`. Scenario fixture bundles use `<scenario>.setup.sql`, `<scenario>.session-a.sql`, `<scenario>.session-b.sql`, and `<scenario>.assert.sql` files in `NETRAOS_PUSH_CONCURRENCY_FIXTURES`. Each race uses two separate `psql` processes. Until all twelve scenario bundles are present and a disposable local database is available, those cases remain skipped; mocks and static checks are not reported as concurrency verification.

The pinned Firebase imports use SDK 13.3.0. The available official source lookup did not expose the exact 13.3.0 FID generator/validator source, so the project does not claim that `^[cdef][\\w-]{21}$` is guaranteed by that version. Registration uses a conservative shape bound instead: 1–128 characters, no ASCII spaces, and no control characters. The database applies the same check only when a FID is inserted or changed; legacy values are retained so unrelated pause/revoke updates cannot fail. This is format validation only and does not prove that the authenticated user controls that Firebase installation. FIDs remain private to the push module and trusted backend.

Settings shows the authenticated account's registered-device rows using only the client installation ID, lifecycle status, generation and last-seen time. Revocation requires a fresh expected generation and is shown as complete only after server confirmation. Recovery requires an explicit click, runs under the same cross-tab lifecycle lock, and rechecks the signed-in account, consent, permission, device generation and lifecycle state after Firebase's global registration callback.

The FID is a routing identifier, not proof of installation ownership. Option A therefore retains residual risk: an authenticated user who learns another installation's FID may attempt to claim it first, although database uniqueness prevents simultaneous account ownership and FIDs are never returned by the app. No cryptographic proof-of-possession is claimed. These files are local preparation only. Do not apply either migration or deploy any Edge Function until a separate deployment approval is given.

The device lifecycle keeps paused devices (including their FID ownership) in their original three-slot reservation. Permanent unsubscribe clears the FID and application consent. If local storage fails during sign-out, pending deactivation metadata falls back to IndexedDB; if neither store is available and server pause also fails, sign-out is blocked and an explicit browser confirmation is required for the emergency escape. That record contains only the original account ID, installation ID, operation ID and expected generation. A paused state is shown only after the server confirms it. Permission `default` and `denied` both request server pause; registration and resume require `granted`.

The database applies per-user limits atomically under the per-user advisory transaction lock: at most 5 new opt-ins/hour, 10 resumes/hour and 10 changed-FID registrations/hour. Pause and revoke are exempt. Matching idempotent retries do not create extra rate events. A persisted `RATE_LIMITED` operation result is immutable; clients must use a new operation ID for a new attempt after the returned `retry_after_seconds`. Device capacity counts pending, active and paused devices, capped at three per account; resuming a paused slot does not count that same row twice.

#### Stage 3B push preferences and device controls

Migration `20261119000100_push_notification_preferences.sql` adds private account-level browser push preferences. Optional categories (`financial_alerts`, `reminders`, `product_updates`, and `announcements_offers`) default to off. Account and security notices are always enabled and are not stored as a user-editable preference. The authenticated RPCs `push_get_notification_preferences()` and `push_set_notification_preference(text, boolean)` derive the account from `auth.uid()`; callers do not supply a user ID. Browser roles cannot query the private table directly. The table cascades with account deletion.

These settings apply to browser push only. Existing in-app reminder settings remain separate in `user_settings`. Campaign delivery is not implemented by this stage; when sending is added, the server must enforce these preferences while selecting recipients. The Settings device list hides client instance UUIDs from visible text; internal instance IDs and current generations are still used in authenticated action payloads. Pause and revoke require server confirmation. A paused device keeps its consent and device slot; revoke is permanent for that device and clears its consent and FID. Resume is offered only from the browser being resumed.

Run `node --test tests/push-stage3b.test.mjs` for the focused client and migration-contract checks. Run `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/push_stage3b.test.sql` only against the same confirmed disposable local Supabase/PostgreSQL database used for Stage 3A validation. This SQL test expects both Stage 3A migrations and pgTAP. It must never be pointed at the live project.

#### Disposable local Stage 3A verification

The acceptance tests refuse all remote database hosts. For independent-session tests, create a disposable local database named exactly `netraos_push_test`, apply migrations `20261118000100_push_devices.sql` and `20261118000200_push_stage3a_remediation.sql` in order, and ensure the local PostgreSQL instance has the Supabase Auth schema/roles and `pgtap` extension available. The runner requires a loopback hostname, the `postgres` owner, that exact database name, and explicit opt-in. From PowerShell, set `$env:NETRAOS_PUSH_TEST_DISPOSABLE = '1'` and `$env:NETRAOS_PUSH_TEST_DATABASE_URL = 'postgresql://postgres:<local-password>@127.0.0.1:<port>/netraos_push_test'`, then run `pnpm test:push`. Apply the two migrations in order with `psql -X -v ON_ERROR_STOP=1 -f <migration-path>` and run pgTAP with `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/push_stage3a.test.sql`. Do not point these tests at the live project or an ordinary development database. The independent-session fixtures generate unique users/identifiers and remove only those generated users and their cascaded rows in `finally`; they restore the test database's prior Firebase app and fingerprint keyring configuration. If `psql` or the disposable database is unavailable, the SQL race tests skip and must be reported as unverified.

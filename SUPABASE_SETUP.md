# Supabase setup for NetraOS

The browser app uses the Supabase project URL and publishable key in `supabase-config.js`. A publishable key is designed for browser use; it cannot create database tables. Never place a Supabase secret or service-role key in this static site.

## Create the table

1. Open the Supabase Dashboard for project `nqacreyemzoiarnaaska`.
2. Open **SQL Editor** and run [`supabase/migrations/20261013000000_create_netraos_user_data.sql`](supabase/migrations/20261013000000_create_netraos_user_data.sql).
3. The migration creates a per-user JSON record table, enables row-level security, and grants authenticated users access only to their own rows.

## Configure authentication

In **Authentication → URL Configuration**, set the Site URL to `https://xivvix988.github.io/NetraOS-APP/` and add that URL to the allowed redirect URLs. Email confirmation can remain enabled; after signing up, users follow the confirmation link and then sign in.

The login screen's **Forgot password?** link sends a recovery email back to that same allowed site URL. Configure Supabase Auth email delivery (custom SMTP recommended for a live app); opening the link lets the user choose and confirm a new password.

## Data behavior

Existing browser records remain local until a user approves the first-upload prompt. The prompt identifies the Supabase account and the record types before upload. After approval, future NetraOS storage changes sync to the authenticated user's rows. Cancel leaves the current app data local. The app continues keeping a browser copy.

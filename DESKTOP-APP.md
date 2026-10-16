# NetraOS for Windows

The desktop client opens the hosted NetraOS app in its own Windows window. Sign-in, email confirmation, and account synchronization continue to use the existing hosted app and Supabase configuration. An internet connection is required to launch and use this desktop client.

Email confirmation and password-reset links open in the default web browser because Supabase redirects to the existing website. After confirming an email or changing a password there, return to the desktop app and sign in.

## Download

After a Windows release has been published, download **NetraOS-Setup.exe** from the [latest GitHub release](https://github.com/XIVVIX988/NetraOS-APP/releases/latest). The installer is per-user and offers a Start menu entry and desktop shortcut.

## Build locally

Install Node.js 22 and pnpm 11, then run:

```powershell
pnpm install --frozen-lockfile
pnpm run dist:windows
```

The installer is written to `dist/NetraOS-Setup.exe`.

## Publish a release

Keep the `package.json` version aligned with its `v`-prefixed Git tag (the initial version is `1.0.0` / `v1.0.0`). Push that tag to trigger the GitHub Actions workflow. It builds the Windows installer and attaches `NetraOS-Setup.exe` to the matching GitHub release. The website's download button points to the latest release asset.

The Windows installer is currently unsigned. Windows may show SmartScreen or an unknown-publisher prompt until the app is distributed with a code-signing certificate.

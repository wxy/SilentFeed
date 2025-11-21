# Privacy & Permissions — Silent Feed (v0.1.0)

This document explains the permissions Silent Feed may request and the privacy commitments we make. Use this text as a basis for the Chrome Web Store "Privacy" and "Permissions" sections.

## Privacy commitments
- Local-first: By default, the extension stores user data (profiles, subscriptions, local analysis) locally in the browser's storage (IndexedDB). No data is uploaded off-device unless the user explicitly enables a feature that requires it.
- Minimal collection: We only collect data that is necessary for the feature to work (e.g., visited pages for building a local interest profile).
- Explicit consent: Any action that could send data to third-party services (for example, using an external AI provider) requires the user to actively configure and consent to providing API keys.
- No sale of personal data: We do not sell personal data to third parties.
- Opt-out and deletion: Users can disable data collection in Options and delete local data via the extension settings.

## Typical permissions and rationale (edit to match `manifest.json` before publishing)
- `storage` — Required to persist user settings, subscriptions, and local profile data.
- `notifications` — Used to show quiet reminders or important alerts to the user.
- `alarms` — Used for periodic tasks like feed polling or scheduled maintenance.
- `activeTab` — (Optional) May be used for RSS discovery helpers when the user interacts with the page.
- `tabs` — (Optional) If used, only to read tab URLs for features like RSS auto-discovery and to open links from the extension.
- Host permissions (e.g. `https://*/*` or a narrower list) — Required to fetch remote feed content or article content for generating recommendations; recommend restricting to only necessary domains or using optional permissions that are requested at runtime.

> Security note: Avoid broad host permissions if possible. Prefer requesting permissions on-demand (optional permissions) when the user takes actions that need them.

## Data flows (example)
1. Local analysis: The extension reads visited page metadata and stores features in IndexedDB. Recommendations are computed locally.
2. Optional AI provider: If the user configures an external AI service (by entering API keys), selected content (e.g., article text or metadata) may be sent to that provider to enrich recommendations. This always requires explicit user consent.
3. Synchronization (optional): If a sync feature is later added and enabled by the user, data may be synced via an account backend; this would be clearly explained and require opt-in.

## What we do NOT do
- We do not collect or transmit browsing data by default.
- We do not share or sell personal profiles to advertisers.

## Suggested store text (short) — Permissions
Silent Feed requests the minimal permissions needed for features: `storage`, `notifications`, and optionally `tabs`/`activeTab` for RSS discovery. When external AI providers are used, API keys must be provided by the user and data is sent only with explicit consent.

## Suggested store text (long) — Privacy
Silent Feed stores reading preferences, subscriptions, and local analysis data locally. By default, none of your browsing history or profiles are uploaded. You control whether to enable optional features that require network access (for example, using external AI services).

---
(Reminder: Before publishing, verify the exact permission keys in `manifest.json` and update this document accordingly.)

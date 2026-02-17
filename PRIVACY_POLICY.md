# Privacy Policy for LinkedIn Notes (Drive Sync)

Last updated: 2026-02-17

## Overview

LinkedIn Notes (Drive Sync) is a Chrome extension that lets users add private notes to LinkedIn profile pages and optionally sync those notes to the user\'s own Google Drive file.

## Data We Process

The extension processes the following data to provide its single purpose:

- LinkedIn profile URLs (for example: `https://www.linkedin.com/in/...`) used as note keys.
- User-entered note content, including:
  - notes text
  - tags
  - relationship value
  - last contacted date
- Google OAuth access token obtained through `chrome.identity` (used only to call Google Drive APIs on the user\'s behalf).
- Local extension preferences (for example panel UI state and auto-sync settings).

## Where Data Is Stored

- Locally in the browser using `chrome.storage.local`.
- Optionally in the user\'s own Google Drive account, in a single file named:
  - `linkedin-notes.json`

## How Data Is Used

Data is used only to:

- Display and edit notes on LinkedIn profile pages.
- Save and retrieve notes locally.
- Sync notes with the user\'s own Google Drive file when the user connects and syncs.

## Data Sharing

- We do **not** sell user data.
- We do **not** transfer user data to third parties for advertising, profiling, or analytics.
- The only third-party service used for synced data is Google Drive, at user request, through Google OAuth.

## Permissions and Why They Are Needed

- `identity`: obtain Google OAuth token for Drive sync.
- `storage`: store notes and settings locally.
- `https://www.linkedin.com/in/*`: show notes UI on LinkedIn profile pages.
- `https://www.googleapis.com/*`: call Google Drive API endpoints for sync.

## Remote Code

The extension does not execute remote code. All executable extension code is packaged with the extension. Network requests are used only for API data exchange.

## User Controls

Users can:

- Use the extension without syncing (local-only notes).
- Disconnect from Google by revoking access in their Google account.
- Delete local extension data by removing extension storage/resetting extension.
- Delete synced notes by removing `linkedin-notes.json` from their Google Drive.

## Contact

For privacy questions, use the contact email listed on the Chrome Web Store item page.

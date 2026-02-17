# LinkedIn Notes Chrome Extension (Manifest V3)

This extension injects a private notes panel on LinkedIn profile pages and syncs data to exactly one Google Drive file named `linkedin-notes.json`.

## What this extension does

- Injects notes UI on `https://www.linkedin.com/in/*`
- Supports minimizing and hiding the overlay (with quick re-open button)
- Provides an **All Notes** list view with profile links
- Supports instant global search across profile links, notes, and tags
- Supports one-click tag chip filtering
- Supports follow-up queue filtering (`last_contacted` older than X days)
- Supports sort toggle for recently updated vs oldest updated
- Supports optional auto-sync debounce after Save (2s, 3s, or 5s)
- Shows lightweight analytics (total notes, top tags, follow-ups due)
- Stores notes locally with `chrome.storage.local`
- Syncs local + remote using pull -> merge -> push
- Uses only OAuth scope `https://www.googleapis.com/auth/drive.file`
- Uses one Drive file (`linkedin-notes.json`) and remembers its `fileId`
- Handles LinkedIn SPA URL changes and avoids duplicate panels

## Files

- `manifest.json`: MV3 config, permissions, OAuth settings
- `background.js`: auth, Drive calls orchestration, merge logic, storage coordination
- `content-script.js`: UI lifecycle and message passing
- `ui.js`: panel rendering and status management
- `drive.js`: Drive API helpers
- `storage.js`: Promise wrappers around `chrome.storage.local`

## Google Cloud OAuth setup for Chrome Extension

1. Open Google Cloud Console and create/select a project.
2. Enable **Google Drive API**.
3. Configure OAuth consent screen.
4. In Chrome, open `chrome://extensions`, enable Developer mode, and load this extension once unpacked to get the extension ID.
5. In Google Cloud, create OAuth credentials compatible with Chrome extension identity flow.
6. Add this authorized redirect URI (replace `<EXTENSION_ID>`):  
   `https://<EXTENSION_ID>.chromiumapp.org/`
7. Set your OAuth client ID in `manifest.json`:
   - `oauth2.client_id`
8. Reload the extension from `chrome://extensions` after updating `manifest.json`.

Important:

- Keep scope to exactly `https://www.googleapis.com/auth/drive.file`.
- Do not add broad scopes like `drive` or `drive.readonly`.

## Load unpacked extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select folder: `linkedin-notes-extension`.
5. Open a LinkedIn profile (`https://www.linkedin.com/in/...`).

## Usage

1. Enter notes/tags/relationship/last-contacted in the panel.
2. Click **Save** for local-only save.
3. Click **Connect** to authorize Drive access.
4. Click **Sync** to pull remote, merge, and push merged result.
5. (Optional) Enable **Auto-sync after Save** and pick delay 2s/3s/5s.
6. Click **All Notes** to open a list of every saved profile note with direct profile links.
7. In the list view, use:
   - search input for instant filtering
   - tag chips for one-click tag filtering
   - follow-up queue toggle + days input
   - sort toggle for recent/oldest updates
8. Use `-` to minimize the panel or `x` to hide it entirely; use **Open Notes** to restore.

If remote file JSON is empty/corrupt, extension asks for confirmation before replacing remote with local data.

## Data format

```json
{
  "meta": {
    "version": 1,
    "last_sync": "2026-02-15T21:10:00Z"
  },
  "profiles": {
    "https://www.linkedin.com/in/janedoe": {
      "notes": "Free text notes...",
      "tags": ["cambridge", "cto-search"],
      "relationship": "peer",
      "last_contacted": "2026-02-10",
      "updated_at": "2026-02-15T21:10:00Z"
    }
  }
}
```

## Manual test checklist

1. **Unauthenticated**: panel loads and local save works.
2. **Connect**: OAuth prompt appears and succeeds.
3. **First sync**: creates one Drive file `linkedin-notes.json`.
4. **Repeat sync**: reuses stored fileId.
5. **Conflict merge**: newer `updated_at` wins per profile.
6. **Remote corrupt/empty**: confirm prompt appears before overwrite.
7. **401 auth issue**: sync retries once after token invalidation/reauth.
8. **404 deleted file**: stale fileId is cleared and file is re-resolved/recreated.
9. **Offline**: sync reports offline; local save still works.
10. **SPA navigation**: switching LinkedIn profiles updates form values.

## Troubleshooting

- **Auth errors**
  - Re-check `manifest.json` OAuth client ID.
  - Re-load unpacked extension after changing manifest.
- **403 Drive denied**
  - Verify Drive API enabled and OAuth client configured correctly.
  - Confirm scope is only `drive.file`.
- **File not found (404)**
  - Extension automatically clears stale fileId and re-resolves the file.
- **Network/offline failures**
  - Local save still works.
  - Retry sync once network is available.
- **No panel appears**
  - Confirm current URL is `https://www.linkedin.com/in/*`.
  - Refresh the LinkedIn page after loading extension.

## Privacy notes

- Extension only reads minimal context from LinkedIn URL for profile keying.
- It does not automate LinkedIn actions.
- It only reads/writes one Drive file used for notes sync.

## Publish to Chrome Web Store

1. Prepare release build:
   - Confirm `manifest.json` has the final `oauth2.client_id`.
   - Verify only required permissions exist: `identity`, `storage`, and the two host permissions.
2. Smoke test locally:
   - Reload extension in `chrome://extensions`.
   - Test Connect, Save, Sync on at least 2 LinkedIn profiles.
3. Create zip package from inside this folder:
   - `zip -r linkedin-notes-extension.zip . -x "*.DS_Store" -x "__MACOSX/*"`
4. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
5. Pay one-time developer registration fee if not already registered.
6. Create a new item and upload `linkedin-notes-extension.zip`.
7. Fill listing metadata:
   - Name, summary, description, screenshots, category.
   - Single-purpose explanation: private notes on LinkedIn profile pages.
8. Complete privacy disclosures:
   - Explain data use: local storage + Drive file `linkedin-notes.json`.
   - State no sale/transfer of personal data.
9. Complete OAuth verification requirements if prompted by Google:
   - Scope is only `drive.file`.
   - Provide demo video and test account if requested.
10. Submit for review and monitor review feedback in the dashboard.

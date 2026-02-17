# linkedin-notes

LinkedIn Notes is a Chrome Extension (Manifest V3) that adds a private notes panel to LinkedIn profile pages and can sync notes to one Google Drive file (`linkedin-notes.json`).

## Status

- Active deliverable: `/linkedin-notes-extension`
- Tampermonkey version: retired and gitignored

## Key features

- Notes panel on `https://www.linkedin.com/in/*`
- Local save via `chrome.storage.local`
- Google Drive sync using OAuth + `drive.file` scope only
- Minimize/hide overlay UI
- All Notes list with:
  - Global search
  - Tag chips filter
  - Follow-up queue (older than X days)
  - Sort by recent/oldest updates
  - Lightweight analytics (total, visible, top tags, follow-ups due)
- Optional auto-sync debounce after save (2s/3s/5s)

## Repository structure

- `/linkedin-notes-extension` - production extension source
- `/PRIVACY_POLICY.md` - privacy policy for Chrome Web Store listing

## Local setup

1. Update OAuth client in `/linkedin-notes-extension/manifest.json`:
   - `oauth2.client_id = PASTE_YOUR_EXTENSION_OAUTH_CLIENT_ID_HERE.apps.googleusercontent.com`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click **Load unpacked**
5. Select `/linkedin-notes-extension`
6. Open a LinkedIn profile page and test Connect / Save / Sync

## Security and publishing notes

- Do not commit credential files or secrets.
- `secrets/`, retired Tampermonkey files, local screenshots, and zip artifacts are gitignored.
- Use `/PRIVACY_POLICY.md` as the source for your Chrome Web Store privacy policy URL.

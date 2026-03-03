# RewardsFindr Chrome Extension

Automatically syncs bank credit card offers to RewardsFindr.

## Setup

1. **Create config file:**
   ```bash
   cp config.example.js config.js
   ```

2. **Fill in your Firebase credentials in `config.js`:**
   - Get Firebase API key from Firebase Console → Project Settings → Web app
   - Update `FIREBASE_API_KEY` and `FIREBASE_AUTH_DOMAIN`
   - Set `API_URL` to your backend (default: `http://localhost:3001`)

3. **Update `manifest.json` with your OAuth2 client ID:**
   - Go to Google Cloud Console → APIs & Credentials
   - Create OAuth 2.0 Client ID for Chrome Extension
   - Extension ID: Get from `chrome://extensions`
   - Copy client ID to `manifest.json` under `oauth2.client_id`

4. **Load extension in Chrome:**
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this repo's root folder

## Usage

1. Click extension icon
2. Sign in with Google
3. Visit your bank's offers page (Chase or Amex)
4. Extension auto-scrapes and syncs offers
5. Check popup to see synced cards

## Supported Banks

- ✅ Chase
- ✅ American Express
- ⏳ Capital One (coming soon)
- ⏳ Citi (coming soon)

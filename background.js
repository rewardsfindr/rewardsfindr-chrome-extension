// ─────────────────────────────────────────────
// BACKGROUND SERVICE WORKER
// Runs persistently in the background
// Responsibilities:
//   1. Receives parsed offers from content scripts
//   2. Syncs offers to Firebase via API
//   3. Updates extension badge to show sync status
// ─────────────────────────────────────────────

import { CONFIG } from './config.js';

const API_URL = CONFIG.API_URL;

// ─────────────────────────────────────────────
// BADGE HELPERS
// Badge is the only UI feedback during silent sync
// Green ✓ = synced, Red ! = error, empty = idle
// ─────────────────────────────────────────────
const setBadge = (text, color) => {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
};

const setBadgeSyncing = () => setBadge('...', '#6366f1');  // indigo — syncing
const setBadgeSuccess = (count) => setBadge(`${count}`, '#10b981'); // green — done
const setBadgeError = () => setBadge('!', '#ef4444');       // red — failed

// ─────────────────────────────────────────────
// GET AUTH TOKEN
// Retrieves stored Firebase ID token from chrome.storage
// ─────────────────────────────────────────────
const getAuthToken = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['firebaseToken'], (result) => {
      resolve(result.firebaseToken || null);
    });
  });
};

// ─────────────────────────────────────────────
// SYNC TO API
// Sends offers + bank + cardName to backend API
// ─────────────────────────────────────────────
const syncToAPI = async (offers, bank, cardName, token) => {
  const response = await fetch(`${API_URL}/api/offers/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ offers, bank, cardName }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
};

// ─────────────────────────────────────────────
// PROCESS OFFERS
// Called when a content script sends parsed offers
// ─────────────────────────────────────────────
const processOffers = async (bank, cardName, rawOffers) => {
  if (!rawOffers?.length) {
    console.warn(`[Background] No offers received from ${bank}`);
    setBadgeError();
    return { success: false, reason: 'no_offers_found' };
  }

  setBadgeSyncing();

  console.log(`[Background] Processing ${rawOffers.length} offers from ${bank} (${cardName})`);

  const token = await getAuthToken();
  if (!token) {
    console.warn('[Background] User not logged in — cannot sync to API');
    setBadgeError();
    return { success: false, reason: 'not_logged_in' };
  }

  try {
    const result = await syncToAPI(rawOffers, bank, cardName, token);
    console.log(`[Background] ✅ API sync successful:`, result);

    // Also store in local storage as backup
    await chrome.storage.local.set({
      [`offers_${bank}_${cardName}`]: {
        bank,
        cardName,
        offers: rawOffers,
        syncedAt: new Date().toISOString(),
      }
    });

    setBadgeSuccess(rawOffers.length);
    return { success: true, synced: rawOffers.length };

  } catch (error) {
    console.error('[Background] ❌ API sync failed:', error);
    setBadgeError();
    return { success: false, reason: error.message };
  }
};

// ─────────────────────────────────────────────
// MESSAGE LISTENER
// Content scripts and popup send messages to background
// ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script finished parsing offers
  if (message.type === 'OFFERS_PARSED') {
    const { bank, cardName, offers } = message.payload;
    console.log(`[Background] Received ${offers?.length} offers from ${bank} (${cardName})`);

    processOffers(bank, cardName, offers)
      .then(result => sendResponse(result))
      .catch(e => {
        console.error('[Background] processOffers error:', e);
        sendResponse({ success: false, reason: e.message });
      });

    return true; // Required for async sendResponse in MV3
  }

  // Popup requesting stored offers
  if (message.type === 'GET_OFFERS') {
    chrome.storage.local.get(null, (items) => {
      const offerKeys = Object.keys(items).filter(k => k.startsWith('offers_'));
      const allOffers = offerKeys.map(k => items[k]);
      sendResponse({ offers: allOffers });
    });
    return true;
  }

  // Popup requesting auth status
  if (message.type === 'GET_AUTH_STATUS') {
    getAuthToken().then(token => {
      sendResponse({ loggedIn: !!token });
    });
    return true;
  }
});

// ─────────────────────────────────────────────
// EXTENSION INSTALL / STARTUP
// ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] RewardsFindr extension installed');
  setBadge('', '#6366f1');
});

console.log('[Background] RewardsFindr service worker started');

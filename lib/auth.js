// ─────────────────────────────────────────────
// AUTHENTICATION
// Uses Chrome Identity API + Firebase REST API
// Can't use Firebase SDK in extensions due to CSP
// ─────────────────────────────────────────────

import { CONFIG } from '../config.js';

/**
 * Sign in with Google using Chrome Identity API
 * Returns Firebase ID token
 */
export async function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (accessToken) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!accessToken) {
        reject(new Error('No token returned'));
        return;
      }

      try {
        const userInfoResponse = await fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!userInfoResponse.ok) {
          throw new Error('Failed to get user info from Google');
        }

        const userInfo = await userInfoResponse.json();

        const tokenInfoResponse = await fetch(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
        );

        const tokenInfo = await tokenInfoResponse.json();
        
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${CONFIG.FIREBASE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postBody: `access_token=${accessToken}&providerId=google.com`,
              requestUri: `https://${CONFIG.FIREBASE_AUTH_DOMAIN}`,
              returnIdpCredential: true,
              returnSecureToken: true,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Firebase auth failed');
        }

        resolve({
          firebaseToken: data.idToken,
          refreshToken: data.refreshToken,
          email: userInfo.email,
          name: userInfo.name,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Sign out
 */
export async function signOut() {
  return new Promise((resolve, reject) => {
    chrome.identity.clearAllCachedAuthTokens(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

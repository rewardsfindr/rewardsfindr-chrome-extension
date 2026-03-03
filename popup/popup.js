// ─────────────────────────────────────────────
// POPUP SCRIPT
// Handles UI interactions in the extension popup
// ─────────────────────────────────────────────

import { signInWithGoogle, signOut } from '../lib/auth.js';

const states = {
  loading: document.getElementById('state-loading'),
  signedout: document.getElementById('state-signedout'),
  signedin: document.getElementById('state-signedin'),
};

const elements = {
  btnSignin: document.getElementById('btn-signin'),
  btnSignout: document.getElementById('btn-signout'),
  userEmail: document.getElementById('user-email'),
  cardList: document.getElementById('card-list'),
  emptyState: document.getElementById('empty-state'),
};

// ─────────────────────────────────────────────
// STATE MANAGEMENT
// ─────────────────────────────────────────────
const showState = (stateName) => {
  Object.values(states).forEach(el => el.classList.remove('active'));
  states[stateName]?.classList.add('active');
};

// ─────────────────────────────────────────────
// AUTH HELPERS
// ─────────────────────────────────────────────
const handleSignIn = async () => {
  try {
    elements.btnSignin.disabled = true;
    elements.btnSignin.textContent = 'Signing in...';

    const authData = await signInWithGoogle();

    await chrome.storage.local.set({ 
      firebaseToken: authData.firebaseToken,
      refreshToken: authData.refreshToken,
      userEmail: authData.email,
      userName: authData.name,
    });

    console.log('✅ Signed in:', authData.email);
    loadDashboard();

  } catch (error) {
    console.error('❌ Sign in failed:', error);
    alert(`Sign in failed: ${error.message}`);
    elements.btnSignin.disabled = false;
    elements.btnSignin.textContent = 'Sign in with Google';
  }
};

const handleSignOut = async () => {
  try {
    await signOut();
    await chrome.storage.local.remove(['firebaseToken', 'refreshToken', 'userEmail', 'userName']);
    console.log('✅ Signed out');
    showState('signedout');
  } catch (error) {
    console.error('❌ Sign out failed:', error);
    alert(`Sign out failed: ${error.message}`);
  }
};

// ─────────────────────────────────────────────
// LOAD DASHBOARD
// ─────────────────────────────────────────────
const loadDashboard = async () => {
  showState('signedin');

  const { userEmail } = await chrome.storage.local.get(['userEmail']);
  elements.userEmail.textContent = userEmail || 'Not signed in';

  chrome.runtime.sendMessage({ type: 'GET_OFFERS' }, (response) => {
    const offers = response?.offers || [];

    if (offers.length === 0) {
      elements.cardList.style.display = 'none';
      elements.emptyState.style.display = 'block';
      return;
    }

    elements.cardList.style.display = 'flex';
    elements.emptyState.style.display = 'none';

    elements.cardList.innerHTML = offers.map(item => {
      const syncedDate = new Date(item.syncedAt).toLocaleDateString();
      return `
        <div class="card-row">
          <div class="card-info">
            <div class="card-name">${item.cardName}</div>
            <div class="card-meta">${item.bank} • ${item.offers.length} offers • ${syncedDate}</div>
          </div>
          <span class="card-badge badge-success">✓</span>
        </div>
      `;
    }).join('');
  });
};

// ─────────────────────────────────────────────
// CHECK AUTH STATUS
// ─────────────────────────────────────────────
const checkAuthStatus = async () => {
  const { firebaseToken } = await chrome.storage.local.get(['firebaseToken']);

  if (firebaseToken) {
    loadDashboard();
  } else {
    showState('signedout');
  }
};

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────
elements.btnSignin.addEventListener('click', handleSignIn);
elements.btnSignout.addEventListener('click', handleSignOut);

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
checkAuthStatus();

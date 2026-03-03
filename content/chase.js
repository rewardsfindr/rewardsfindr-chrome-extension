// ─────────────────────────────────────────────
// CHASE CONTENT SCRIPT
// Runs automatically when user visits chase.com offers page
// Parses offer cards from the DOM and sends to background
// Never writes to DB directly — always via background message
//
// Verified selectors (March 2026):
//   Card container : [data-testid="offer-tile-grid-item-container"]
//   Commerce tile  : [data-testid="commerce-tile"]
//   Merchant name  : span.mds-body-small-heavier
//   Cashback amount: span.mds-body-large-heavier
//   Activation     : aria-label contains "Add offer" = not activated
// ─────────────────────────────────────────────

// ── Constants ────────────────────────────────────
const BANK = 'chase';
const PARSE_DELAY_MS = 2000; // Chase renders via React — wait for DOM to settle

// ── Category Inference ───────────────────────────
const inferCategory = (merchantName) => {
  const name = merchantName.toLowerCase();
  if (/restaurant|cafe|coffee|starbucks|mcdonald|chipotle|pizza|sushi|grill|diner|bistro|burger|taco|subway|panera/.test(name)) return 'dining';
  if (/grocery|supermarket|whole foods|trader joe|kroger|safeway|wegmans|publix|aldi|costco|walmart|target/.test(name)) return 'grocery';
  if (/shell|bp|chevron|exxon|mobil|gas|fuel|citgo|marathon|sunoco/.test(name)) return 'gas';
  if (/cvs|walgreens|rite aid|pharmacy|drugstore/.test(name)) return 'drugstore';
  if (/hotel|airlines|flights|marriott|hilton|hyatt|united|delta|american airlines|airbnb|expedia/.test(name)) return 'travel';
  if (/amazon|best buy|nike|apple|walmart\.com|target\.com|ebay|etsy/.test(name)) return 'shopping';
  if (/netflix|spotify|hulu|disney|apple tv|youtube|amazon prime/.test(name)) return 'subscription';
  return 'other';
};

// ── Parse Cashback Amount ─────────────────────────
const parseCashback = (text) => {
  if (!text) return { cashbackAmount: 0, cashbackType: 'fixed' };

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return { cashbackAmount: parseFloat(percentMatch[1]), cashbackType: 'percent' };
  }

  const fixedMatch = text.match(/\$(\d+(?:\.\d+)?)/);
  if (fixedMatch) {
    return { cashbackAmount: parseFloat(fixedMatch[1]), cashbackType: 'fixed' };
  }

  return { cashbackAmount: 0, cashbackType: 'fixed' };
};

// ── Parse Minimum Spend ───────────────────────────
const parseMinimumSpend = (text) => {
  if (!text) return 0;
  const match = text.match(/\$(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
};

// ── Parse Expiry Date ─────────────────────────────
const parseExpiry = (text) => {
  if (!text) return null;

  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    return new Date(`${slashMatch[3]}-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`).toISOString();
  }

  const wordMatch = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (wordMatch) {
    return new Date(`${wordMatch[1]} ${wordMatch[2]}, ${wordMatch[3]}`).toISOString();
  }

  return null;
};

// ── Detect Card Name ─────────────────────────────
const detectCardName = () => {
  const accountEl =
    document.querySelector('[data-testid="account-display-name"]') ||
    document.querySelector('[data-testid="selected-account-name"]') ||
    document.querySelector('[class*="accountName"]') ||
    document.querySelector('[class*="account-name"]');

  if (accountEl?.textContent?.trim()) {
    return accountEl.textContent.trim();
  }

  const headingEl = document.querySelector('h1');
  if (headingEl?.textContent) {
    const text = headingEl.textContent;
    if (/Freedom|Sapphire|Ink|Slate|Amazon|Disney|United|Marriott|Southwest/i.test(text)) {
      return text.trim();
    }
  }

  return 'Chase Card';
};

// ── Main Parser ─────────────────────────────────
const parseChaseOffers = () => {
  const offers = [];

  const offerCards = document.querySelectorAll('[data-testid="offer-tile-grid-item-container"]');

  console.log(`[RewardsFindr] Found ${offerCards.length} offer elements on Chase page`);

  if (!offerCards.length) {
    console.warn('[RewardsFindr] No offer cards found — Chase may have updated their DOM');
    return [];
  }

  offerCards.forEach((card, index) => {
    try {
      const commerceTile = card.querySelector('[data-testid="commerce-tile"]');
      if (!commerceTile) return;

      const merchantEl = commerceTile.querySelector('span.mds-body-small-heavier');
      const merchantName = merchantEl?.textContent?.trim();
      if (!merchantName) {
        console.warn(`[RewardsFindr] Skipping offer ${index} — no merchant name found`);
        return;
      }

      const cashbackEl = commerceTile.querySelector('span.mds-body-large-heavier');
      const cashbackText = cashbackEl?.textContent?.trim() || '';
      const { cashbackAmount, cashbackType } = parseCashback(cashbackText);

      const offerDescription = cashbackText;
      const minimumSpend = parseMinimumSpend(cashbackText);

      const ariaLabel = commerceTile.getAttribute('aria-label') || '';
      const isActivated = !ariaLabel.toLowerCase().includes('add offer');

      const activateButton = isActivated ? null : commerceTile;
      const expiryDate = null;
      const category = inferCategory(merchantName);

      offers.push({
        merchantName,
        offerDescription,
        cashbackAmount,
        cashbackType,
        minimumSpend,
        expiryDate,
        category,
        isActivated,
        activateButton,
      });

    } catch (e) {
      console.error(`[RewardsFindr] Error parsing offer card ${index}:`, e);
    }
  });

  console.log(`[RewardsFindr] Successfully parsed ${offers.length} Chase offers`);
  return offers;
};

// ── Send to Background ──────────────────────────────
const syncOffers = (cardName, offers) => {
  chrome.runtime.sendMessage(
    {
      type: 'OFFERS_PARSED',
      payload: { bank: BANK, cardName, offers },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[RewardsFindr] Message error:', chrome.runtime.lastError);
        return;
      }
      if (response?.success) {
        console.log(`[RewardsFindr] ✓ Chase sync complete — ${response.synced} offers written`);
      } else {
        console.warn('[RewardsFindr] ✗ Chase sync failed:', response?.reason);
      }
    }
  );
};

// ── Activate All Offers ─────────────────────────────
const activateAllOffers = async (offers) => {
  const unactivated = offers.filter(o => !o.isActivated && o.activateButton);

  if (unactivated.length === 0) {
    alert('All offers are already activated! ✓');
    return;
  }

  console.log(`[RewardsFindr] Activating ${unactivated.length} offers...`);
  let activated = 0;
  let failed = 0;

  for (const offer of unactivated) {
    try {
      offer.activateButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 300));
      offer.activateButton.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      activated++;
      console.log(`[RewardsFindr] ✓ Activated: ${offer.merchantName}`);
    } catch (e) {
      failed++;
      console.error(`[RewardsFindr] ✗ Failed to activate: ${offer.merchantName}`, e);
    }
  }

  alert(`Activation complete!\n✓ Activated: ${activated}\n✗ Failed: ${failed}`);
};

// ── Create Floating Button ───────────────────────────
const createFloatingButton = (offers) => {
  const existing = document.getElementById('rewardsfindr-activate-btn');
  if (existing) existing.remove();

  const unactivatedCount = offers.filter(o => !o.isActivated && o.activateButton).length;

  if (unactivatedCount === 0) {
    console.log('[RewardsFindr] All offers already activated — not showing button');
    return;
  }

  const button = document.createElement('button');
  button.id = 'rewardsfindr-activate-btn';
  button.innerHTML = `
    <span style="font-size: 18px; margin-right: 6px;">⚡</span>
    <span>Activate All (${unactivatedCount})</span>
  `;

  Object.assign(button.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '999999',
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease',
  });

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 12px 24px rgba(79, 70, 229, 0.4), 0 4px 8px rgba(0, 0, 0, 0.15)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 8px 16px rgba(79, 70, 229, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)';
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';
    button.innerHTML = '<span style="font-size: 18px;">⏳</span> <span>Activating...</span>';
    await activateAllOffers(offers);
    setTimeout(() => {
      button.remove();
      boot();
    }, 1000);
  });

  document.body.appendChild(button);
  console.log(`[RewardsFindr] ✓ Floating button added (${unactivatedCount} offers)`);
};

// ── Boot ───────────────────────────────────────────
const boot = () => {
  console.log('[RewardsFindr] Chase content script loaded — waiting for DOM…');

  setTimeout(() => {
    const cardName = detectCardName();
    console.log(`[RewardsFindr] Detected card: ${cardName}`);

    const offers = parseChaseOffers();

    if (offers.length > 0) {
      syncOffers(cardName, offers);
      createFloatingButton(offers);
    } else {
      console.warn('[RewardsFindr] No offers parsed — skipping sync');
    }
  }, PARSE_DELAY_MS);
};

boot();

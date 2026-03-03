// ─────────────────────────────────────────────
// AMEX CONTENT SCRIPT
// Runs automatically when user visits americanexpress.com offers page
// Amex offers page is server-side rendered but loads offer tiles
// dynamically — we wait longer than Chase (3s vs 2s)
// ─────────────────────────────────────────────

// ── Constants ────────────────────────────────
const BANK = 'amex';
const PARSE_DELAY_MS = 3000; // Amex loads offers slightly slower than Chase

// ── Category Inference ───────────────────────
const inferCategory = (merchantName) => {
  const name = merchantName.toLowerCase();

  if (/restaurant|cafe|coffee|starbucks|mcdonald|chipotle|pizza|sushi|grill|diner|bistro|burger|taco|subway|panera/.test(name)) {
    return 'dining';
  }
  if (/grocery|supermarket|whole foods|trader joe|kroger|safeway|wegmans|publix|aldi|costco|walmart|target/.test(name)) {
    return 'grocery';
  }
  if (/shell|bp|chevron|exxon|mobil|gas|fuel|citgo|marathon|sunoco/.test(name)) {
    return 'gas';
  }
  if (/cvs|walgreens|rite aid|pharmacy|drugstore/.test(name)) {
    return 'drugstore';
  }
  if (/hotel|airlines|flights|marriott|hilton|hyatt|united|delta|american airlines|airbnb|expedia/.test(name)) {
    return 'travel';
  }
  if (/amazon|best buy|nike|apple|walmart\.com|target\.com|ebay|etsy/.test(name)) {
    return 'shopping';
  }
  if (/netflix|spotify|hulu|disney|apple tv|youtube|amazon prime/.test(name)) {
    return 'subscription';
  }

  return 'other';
};

// ── Parse Cashback Amount ─────────────────────
const parseCashback = (text) => {
  if (!text) return { cashbackAmount: 0, cashbackType: 'fixed' };

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return {
      cashbackAmount: parseFloat(percentMatch[1]),
      cashbackType: 'percent',
    };
  }

  const allAmounts = [...text.matchAll(/\$(\d+(?:\.\d+)?)/g)];
  if (allAmounts.length > 0) {
    const lastAmount = allAmounts[allAmounts.length - 1];
    return {
      cashbackAmount: parseFloat(lastAmount[1]),
      cashbackType: 'fixed',
    };
  }

  return { cashbackAmount: 0, cashbackType: 'fixed' };
};

// ── Parse Minimum Spend ───────────────────────
const parseMinimumSpend = (text) => {
  if (!text) return 0;

  const spendMatch = text.match(/(?:spend|on|purchase[s]? of)\s*\$(\d+(?:\.\d+)?)/i);
  if (spendMatch) return parseFloat(spendMatch[1]);

  const allAmounts = [...text.matchAll(/\$(\d+(?:\.\d+)?)/g)];
  if (allAmounts.length > 1) return parseFloat(allAmounts[0][1]);

  return 0;
};

// ── Parse Expiry Date ─────────────────────────
const parseExpiry = (text) => {
  if (!text) return null;

  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2
      ? `20${slashMatch[3]}`
      : slashMatch[3];
    return new Date(
      `${year}-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`
    ).toISOString();
  }

  const wordMatch = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (wordMatch) {
    return new Date(`${wordMatch[1]} ${wordMatch[2]}, ${wordMatch[3]}`).toISOString();
  }

  return null;
};

// ── Detect Card Name ──────────────────────────
const detectCardName = () => {
  const cardEl = document.querySelector([
    '[data-module-name="offers"] [class*="cardName"]',
    '[class*="card-name"]',
    '[class*="cardTitle"]',
    '[data-testid="card-name"]',
    '.account-selector [class*="name"]',
  ].join(', '));

  if (cardEl?.textContent?.trim()) {
    return cardEl.textContent.trim();
  }

  const titleEl = document.querySelector('h1, h2');
  if (titleEl?.textContent?.toLowerCase().includes('gold') ||
      titleEl?.textContent?.toLowerCase().includes('platinum') ||
      titleEl?.textContent?.toLowerCase().includes('blue cash')) {
    return titleEl.textContent.trim();
  }

  return 'Amex Card';
};

// ── Main Parser ───────────────────────────────
const parseAmexOffers = () => {
  const offers = [];

  const offerCards = document.querySelectorAll([
    '[data-module-name="offers"] li',
    '[class*="offer-tile"]',
    '[class*="offerTile"]',
    '[class*="OfferCard"]',
    '[class*="offer-item"]',
    '.offers-list li',
  ].join(', '));

  console.log(`[RewardsFindr] Found ${offerCards.length} offer elements on Amex page`);

  if (!offerCards.length) {
    console.warn('[RewardsFindr] No offer tiles found — Amex may have updated their DOM');
    return [];
  }

  offerCards.forEach((card, index) => {
    try {
      const merchantEl = card.querySelector([
        '[class*="merchant"]',
        '[class*="Merchant"]',
        '[class*="title"]',
        'h3',
        'h4',
        'strong',
      ].join(', '));

      const merchantName = merchantEl?.textContent?.trim();
      if (!merchantName) {
        console.warn(`[RewardsFindr] Skipping offer ${index} — no merchant name`);
        return;
      }

      const descEl = card.querySelector([
        '[class*="description"]',
        '[class*="offerDetail"]',
        '[class*="reward"]',
        '[class*="terms"]',
        'p',
      ].join(', '));

      const description = descEl?.textContent?.trim() || '';
      const { cashbackAmount, cashbackType } = parseCashback(description);
      const minimumSpend = parseMinimumSpend(description);

      const expiryEl = card.querySelector([
        '[class*="expir"]',
        '[class*="valid"]',
        '[class*="date"]',
        'time',
        '[class*="Expir"]',
      ].join(', '));

      const expiryDate = parseExpiry(expiryEl?.textContent?.trim() || '');

      const activateBtn = card.querySelector('button');
      const isActivated = activateBtn
        ? activateBtn.textContent?.toLowerCase().includes('added') ||
          activateBtn.textContent?.toLowerCase().includes('enrolled')
        : false;

      const category = inferCategory(merchantName);

      offers.push({
        merchantName,
        offerDescription: description,
        cashbackAmount,
        cashbackType,
        minimumSpend,
        expiryDate,
        category,
        isActivated,
      });

    } catch (e) {
      console.error(`[RewardsFindr] Error parsing Amex offer ${index}:`, e);
    }
  });

  console.log(`[RewardsFindr] Successfully parsed ${offers.length} Amex offers`);
  return offers;
};

// ── Send to Background ────────────────────────
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
        console.log(`[RewardsFindr] ✓ Amex sync complete — ${response.synced} offers written`);
      } else {
        console.warn('[RewardsFindr] ✗ Amex sync failed:', response?.reason);
      }
    }
  );
};

// ── Boot ──────────────────────────────────────
const boot = () => {
  console.log('[RewardsFindr] Amex content script loaded — waiting for DOM…');

  setTimeout(() => {
    const cardName = detectCardName();
    console.log(`[RewardsFindr] Detected card: ${cardName}`);

    const offers = parseAmexOffers();

    if (offers.length > 0) {
      syncOffers(cardName, offers);
    } else {
      console.warn('[RewardsFindr] No offers parsed — skipping sync');
    }
  }, PARSE_DELAY_MS);
};

boot();

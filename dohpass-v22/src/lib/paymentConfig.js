// ============================================================
// MANUAL BANK-TRANSFER CONFIG — FILL THESE IN
// ------------------------------------------------------------
// Temporary manual payment rail (no Stripe/Lemon Squeezy yet).
// Replace every REPLACE_ME below with your real details before
// shipping. These are shown to the buyer on the checkout screen.
// ============================================================

// Your receiving bank account. Shown so the buyer can transfer.
export const BANK_DETAILS = {
  accountName:   'HUZAIFA GURASHI ALI IBRAHIM',
  bankName:      'First Abu Dhabi Bank PJSC',
  accountNumber: '1561004645389002',
  iban:          'AE130351561004645389002',
  swift:         'NBADAEAAXXX',
  currency:      'AED',
}

// Where buyers email their transfer proof. Also used as the support contact.
export const SUPPORT_EMAIL = 'support@dohpass.com'

// How quickly you commit to activating access after proof is received.
// Used verbatim in the "what happens next" copy and confirmation screen.
export const ACTIVATION_WINDOW = '24 hours'

// ── PLAN CATALOGUE (single source of truth) ─────────────────
// amount = monthly price in whole AED (matches profiles.plan + manual_orders.amount_aed).
export const PLANS = {
  gp:         { id: 'gp',         name: 'GP Track',         amount: 49 },
  specialist: { id: 'specialist', name: 'Specialist Track', amount: 69 },
  all_access: { id: 'all_access', name: 'All Access',       amount: 89 },
}

export function getPlan(id) {
  return PLANS[id] || PLANS.specialist
}

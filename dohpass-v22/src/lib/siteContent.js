// Marketing copy shared by Home and Pricing, so the two pages can't drift.
// Prices come from paymentConfig.PLANS; question counts come from the
// get_question_counts RPC at runtime. Nothing here may state a number that
// the backend owns.
import { PLANS, ACTIVATION_WINDOW, SUPPORT_EMAIL } from './paymentConfig'

export const fmt = (n) => (n == null ? null : Number(n).toLocaleString('en-US'))

// Plan presentation. Equal weight by design: which plan fits depends only on
// the exam the candidate is sitting, so no plan is pushed as "recommended".
export function buildPlans(counts) {
  const gp = fmt(counts?.gp)
  const sp = fmt(counts?.specialist)
  const total = counts?.gp != null && counts?.specialist != null ? fmt(counts.gp + counts.specialist) : null
  const cards = fmt(counts?.flashcards)
  return [
    {
      ...PLANS.gp,
      audience: 'For the DOH GP exam',
      features: [
        gp ? `${gp} GP questions` : 'The full GP question bank',
        'Mapped to the DOH GP blueprint',
        'Explanations with guideline references',
      ],
    },
    {
      ...PLANS.specialist,
      audience: 'For the DOH Internal Medicine Specialist exam',
      features: [
        sp ? `${sp} Specialist questions` : 'The full Specialist question bank',
        'Cardiology, respiratory, nephrology and every other system',
        'Pearson VUE-style clinical vignettes',
      ],
    },
    {
      ...PLANS.all_access,
      audience: 'For both exams, with flashcards and mock exams',
      features: [
        total ? `Both banks — ${total} questions` : 'Both question banks',
        cards ? `${cards} flashcards` : 'Flashcards',
        'Mock exams and all future content',
      ],
    },
  ]
}

export const PLAN_TERMS = [
  'Each payment covers 30 days',
  'No subscription and no auto-renewal',
  '7-day refund on your first payment',
]

export const PAYMENT_STEPS = [
  {
    title: 'Choose your plan',
    body: 'Sign in and pick your track. You get the bank details and your own payment reference.',
  },
  {
    title: 'Send the transfer',
    body: 'From any UAE bank account or Wise. Put your payment reference in the transfer memo.',
  },
  {
    title: `Access within ${ACTIVATION_WINDOW}`,
    body: `Email your receipt to ${SUPPORT_EMAIL}. We match the transfer and switch on 30 days of access.`,
  },
]

export const FAQ = {
  tryFirst: {
    q: 'Can I try DOHPass before paying?',
    a: 'Yes. Answer the sample questions on this page, then 3 questions from the real bank without an account. A free account adds 10 more, with full explanations. No payment details needed.',
  },
  blueprint: {
    q: 'Is DOHPass aligned with the current DOH blueprint?',
    a: 'Yes. Every question is mapped to the current DOH blueprint and reviewed when the framework is updated.',
  },
  payment: {
    q: 'How does payment work?',
    a: 'You pay once by bank transfer for 30 days of access. There is no subscription and nothing renews automatically. When the 30 days end, access pauses until you send another transfer.',
  },
  methods: {
    q: 'What payment methods do you accept?',
    a: `Direct bank transfer or Wise. Pick a plan, follow the transfer instructions on the checkout page, and access is switched on within ${ACTIVATION_WINDOW} of us confirming your transfer.`,
  },
  refund: {
    q: 'What if it isn’t right for me?',
    a: `Your first payment is covered by a 7-day refund. Email ${SUPPORT_EMAIL} and we’ll return it.`,
  },
  whichTrack: {
    q: 'GP or Specialist — which do I need?',
    a: 'Choose the bank that matches the exam you are sitting. If you are preparing for both, All Access includes both banks for less than buying them separately.',
  },
  updates: {
    q: 'How often are questions updated?',
    a: 'Questions are revised when a guideline changes or when someone reports an error to hello@dohpass.com. New questions are added in batches rather than on a fixed schedule.',
  },
  switchPlan: {
    q: 'Can I switch between plans?',
    a: `Yes. Pay for the new plan by bank transfer and email ${SUPPORT_EMAIL}; we’ll adjust your access window.`,
  },
  vat: {
    q: 'Do prices include VAT?',
    a: 'Yes. Prices include all applicable taxes.',
  },
}

// Systems covered, by question volume in the live bank (Oct 2026). Names
// only — counts are deliberately not hardcoded.
export const SPECIALIST_SYSTEMS = [
  'Gastroenterology', 'Neurology', 'Pharmacology', 'Rheumatology', 'Cardiology',
  'Endocrinology', 'Nephrology', 'Respiratory', 'Haematology', 'Dermatology',
  'Infectious disease', 'Psychiatry', 'Oncology',
]
export const GP_SYSTEMS = [
  'Respiratory', 'Gastroenterology', 'Cardiology', 'Musculoskeletal', 'Endocrinology',
  'Psychiatry', 'Obstetrics & gynaecology', 'Infectious disease', 'Dermatology',
  'Neurology', 'Paediatrics', 'Emergency medicine', 'Preventive medicine',
]

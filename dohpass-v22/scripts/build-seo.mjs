// scripts/build-seo.mjs
// Runs AFTER `vite build`. Fetches sample questions from the existing anon RPC,
// renders static SEO landing pages into dist/, plus sitemap.xml + robots.txt.
// Never fails the build: if Supabase is unreachable, falls back to baked-in samples.
//
// Wire-up (package.json):  "build": "vite build && node scripts/build-seo.mjs"
//
// Env used (already present in your Vercel project — no new secrets):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// Optional override:  SEO_BASE_URL (defaults to https://www.dohpass.com — www is the canonical
//                     host; non-www 307s to www, so a non-www canonical would loop)

import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLandingPage } from './seo-template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const BASE_URL = (process.env.SEO_BASE_URL || 'https://www.dohpass.com').replace(/\/+$/, '');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const SAMPLES_PER_PAGE = 5; // RPC hard-caps at 5

// ───────────────────────────────────────────────────────────────────────────
// TARGET PAGES — single source of truth. Edit slugs/titles/keywords here.
// Slugs MUST NOT collide with existing app routes (/, /specialist, /gp,
// /oncology, /pricing, /about, /features, /contact, /terms, /privacy).
// ───────────────────────────────────────────────────────────────────────────
const PAGES = [
  {
    slug: 'internal-medicine-exam-questions',
    track: 'specialist',
    countKey: 'specialist',
    eyebrow: 'DOH · DHA · MOH — Internal Medicine Specialist',
    title: 'DOH, DHA & MOH Internal Medicine Exam Questions | DOHPass',
    metaDescription:
      'Practise DOH, DHA and MOH internal medicine specialist (Prometric) exam questions written by an MRCP doctor who passed the exam. Free sample questions with full explanations.',
    h1: 'DOH, DHA & MOH Internal Medicine Specialist Exam Questions',
    intro:
      'Practice questions for the UAE internal medicine specialist licensing exams (DOH, DHA and MOH Prometric), each with the full clinical reasoning behind the answer. Authored by an MRCP-qualified doctor who has sat the exam.',
  },
  {
    slug: 'gp-exam-questions',
    track: 'gp',
    countKey: 'gp',
    eyebrow: 'DOH · DHA · MOH — General Practitioner',
    title: 'DOH, DHA & MOH GP Exam Questions (Prometric) | DOHPass',
    metaDescription:
      'Practise DOH, DHA and MOH GP (general practitioner) Prometric exam questions with detailed explanations and references. Written and reviewed by an MRCP-qualified doctor.',
    h1: 'DOH, DHA & MOH GP (General Practitioner) Exam Questions',
    intro:
      'Practice questions for the UAE GP licensing exams (DOH, DHA and MOH Prometric), each with a worked explanation, the wrong-option traps, and the guideline it rests on. Built by an MRCP-qualified doctor.',
  },
];

// FAQs per track. Answers here are either evergreen or about DOHPass itself.
// ⚠️ Do NOT add official-exam facts (question count, pass mark, fee, duration)
// without Huzaifa's verified sign-off — those vary by authority and year.
const FAQS = {
  specialist: [
    {
      q: 'Are these the actual DOH or DHA exam questions?',
      a: 'No. These are original practice questions modelled on the style and clinical level of the DOH, DHA and MOH internal medicine specialist exams. They are written to teach the reasoning the exams test, not copied from any official paper.',
    },
    {
      q: 'Who writes the questions?',
      a: 'Every question is authored and reviewed by an MRCP-qualified physician who has personally sat the DOH licensing exam.',
    },
    {
      q: 'Do the questions come with explanations?',
      a: 'Yes. Each question includes a full explanation covering why the correct answer is right, why each distractor is wrong, and the guideline or trial it is based on.',
    },
    {
      q: 'Is there a free way to try DOHPass first?',
      a: 'Yes. You can practise the free sample questions on this page and download a free 50-question mock exam before subscribing to the full bank.',
    },
    {
      q: 'Does DOHPass cover GP candidates too?',
      a: 'Yes. There are separate banks for Internal Medicine Specialist and General Practitioner candidates across DOH, DHA and MOH.',
    },
  ],
  gp: [
    {
      q: 'Are these the real DHA or DOH GP exam questions?',
      a: 'No. They are original practice questions written to match the style and difficulty of the DOH, DHA and MOH GP Prometric exams — designed to teach the underlying reasoning rather than reproduce any official paper.',
    },
    {
      q: 'Who writes and checks the GP questions?',
      a: 'They are authored and reviewed by an MRCP-qualified doctor who has sat the DOH exam, with explanations grounded in current guidelines.',
    },
    {
      q: 'Do GP questions include worked explanations?',
      a: 'Yes — every question explains the correct answer, the wrong-option traps, and the source guideline so you learn the principle, not just the key.',
    },
    {
      q: 'Can I try some GP questions for free?',
      a: 'Yes. Practise the free samples on this page and grab the free 50-question mock exam before deciding on a plan.',
    },
  ],
};

// ── Baked-in fallback samples (real bank content) — used only if the build-time
//    fetch fails, so a deploy never ships an empty page.
const FALLBACK = {
  specialist: [
    {
      id: 'fallback-spec-1',
      topic: 'Pharmacology',
      answer: 'B',
      q: 'A clinical pharmacology teaching session is held for internal medicine residents. The pharmacologist uses amiodarone as an example of a drug with a very large volume of distribution (Vd >5,000 L in a 70 kg adult). Which of the following best describes the clinical implication of such a large Vd?',
      options: [
        'A: The drug primarily remains in the plasma compartment, making plasma concentration an accurate reflection of total body drug load',
        'B: The drug distributes extensively into peripheral tissues; plasma concentrations are low relative to total body drug burden, elimination half-life is very long, and dialysis is ineffective at removal',
        'C: High plasma protein binding is responsible for the large Vd, making free drug monitoring essential for safe dosing',
        'D: The large Vd directly slows gastrointestinal absorption, necessitating extended-release formulations to achieve therapeutic levels',
      ],
      explanation:
        'A very large volume of distribution means most drug resides in peripheral tissues, not plasma. Consequences: plasma levels underestimate total body burden; elimination half-life is markedly prolonged (amiodarone t-half 40-55 days); haemodialysis removes only the plasma fraction and is therefore ineffective; and loading doses are required to saturate tissue stores before therapeutic plasma levels are reached.\n\nClinical pearl: drugs with large Vd (amiodarone, digoxin, chloroquine) are notoriously difficult to remove in overdose — supportive care, not dialysis, is the cornerstone of management.',
    },
  ],
  gp: [
    {
      id: 'fallback-gp-1',
      topic: 'Alcohol Dependence',
      answer: 'C',
      q: 'A 47-year-old man is brought in after two witnessed generalised tonic-clonic seizures, three days after abruptly stopping heavy daily alcohol use. He is tremulous and agitated, CIWA-Ar 26, blood glucose 3.2 mmol/L, magnesium 0.6 mmol/L, MCV 104 fL. What is the most appropriate immediate intervention?',
      options: [
        'Intravenous dextrose 10% infusion to correct the hypoglycaemia',
        'Intravenous magnesium sulphate replacement followed by oral supplementation',
        'Intravenous thiamine (Pabrinex) before any glucose-containing fluids',
        'Oral chlordiazepoxide 40 mg as the first dose of a reducing regimen',
        'Oral naltrexone 50 mg daily to prevent further alcohol-related seizures',
      ],
      explanation:
        'In chronic alcohol dependence there is a high risk of Wernicke encephalopathy from thiamine depletion. Giving glucose before thiamine can precipitate or worsen acute Wernicke encephalopathy, because thiamine is an essential cofactor in glucose metabolism. Parenteral thiamine (Pabrinex) must therefore be given before or with any glucose-containing fluids in at-risk patients.\n\nKey learning point: thiamine before glucose is a critical, potentially life-saving sequencing decision in any malnourished or alcohol-dependent patient.',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────

const roundDownDisplay = (n) => {
  const floored = Math.max(0, Math.floor(Number(n) / 100) * 100);
  return `${floored.toLocaleString('en-US')}+`;
};

async function main() {
  let supabase = null;
  if (SUPABASE_URL && SUPABASE_ANON) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false },
    });
  } else {
    console.warn('[seo] Supabase env not found — using fallback samples/counts.');
  }

  // Counts (for the "X,X00+" badge). Falls back to conservative numbers.
  let counts = { specialist: 2400, gp: 900 };
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('get_question_counts');
      if (error) throw error;
      if (data && typeof data === 'object') counts = { ...counts, ...data };
    } catch (e) {
      console.warn('[seo] get_question_counts failed, using fallback:', e.message);
    }
  }

  const urls = [`${BASE_URL}/`];

  for (const page of PAGES) {
    // Fetch fresh samples; fall back to baked-in content on any failure.
    let questions = FALLBACK[page.track] || [];
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('get_preview_questions', {
          p_track: page.track,
          p_limit: SAMPLES_PER_PAGE,
        });
        if (error) throw error;
        const rows = (data || []).filter((r) => r && r.q && Array.isArray(r.options));
        if (rows.length) questions = rows;
      } catch (e) {
        console.warn(`[seo] preview fetch failed for ${page.track}, using fallback:`, e.message);
      }
    }

    const countDisplay = roundDownDisplay(counts[page.countKey]);
    const faqs = FAQS[page.track] || [];

    const html = renderLandingPage({ page, questions, countDisplay, faqs, baseUrl: BASE_URL });

    const outDir = join(DIST, page.slug);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'index.html'), html, 'utf8');
    urls.push(`${BASE_URL}/${page.slug}`);
    console.log(`[seo] wrote dist/${page.slug}/index.html (${questions.length} samples)`);
  }

  // Static public pages worth listing in the sitemap (already exist in the app).
  for (const p of ['pricing', 'about', 'features', 'oncology']) urls.push(`${BASE_URL}/${p}`);

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10);
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...new Set(urls)]
      .map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`)
      .join('\n') +
    `\n</urlset>\n`;
  await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');

  // robots.txt
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`;
  await writeFile(join(DIST, 'robots.txt'), robots, 'utf8');

  console.log(`[seo] wrote dist/sitemap.xml (${[...new Set(urls)].length} urls) + dist/robots.txt`);
}

main().catch((err) => {
  // Never fail the production build because of the SEO step.
  console.error('[seo] non-fatal error:', err);
  process.exit(0);
});

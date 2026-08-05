// scripts/seo-template.mjs
// Pure HTML renderer for DOHPass SEO landing pages.
// No external requests, no JS required to read content (progressive enhancement only).
// Every DB string is HTML-escaped. Output is fully crawlable static HTML.

import { resolveCorrectIndex } from '../src/lib/resolveCorrectIndex.js';

const esc = (s = '') =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

// Explanation text arrives with \n\n paragraph breaks -> <p> blocks, escaped.
const explanationToHtml = (text = '') =>
  String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');

// Options may arrive letter-prefixed ("A: ...") or plain. Normalise both.
function normaliseOption(opt, idx) {
  const letter = String.fromCharCode(65 + idx); // A, B, C, D, E
  const raw = String(opt ?? '').trim();
  const prefixed = /^[A-E]\s*[:.)-]/i.test(raw);
  const text = prefixed ? raw.replace(/^[A-E]\s*[:.)-]\s*/i, '') : raw;
  return { letter, text };
}

function renderQuestion(qObj, n) {
  const options = Array.isArray(qObj.options) ? qObj.options : [];
  const ci = resolveCorrectIndex(options, qObj.answer);

  const optsHtml = options
    .map((opt, i) => {
      const { letter, text } = normaliseOption(opt, i);
      const isCorrect = i === ci;
      return `<li class="opt${isCorrect ? ' opt--correct' : ''}" data-correct="${isCorrect ? '1' : '0'}">
        <span class="opt__letter">${esc(letter)}</span>
        <span class="opt__text">${esc(text)}</span>
        <span class="opt__tick" aria-hidden="true">&#10003;</span>
      </li>`;
    })
    .join('');

  return `<article class="q" itemscope itemtype="https://schema.org/Question">
    <div class="q__head">
      <span class="q__num">Q${n}</span>
      ${qObj.topic ? `<span class="q__topic">${esc(qObj.topic)}</span>` : ''}
    </div>
    <p class="q__stem" itemprop="name">${esc(qObj.q)}</p>
    <ul class="q__opts">${optsHtml}</ul>
    <button class="q__reveal" type="button" aria-expanded="false">Reveal answer &amp; explanation</button>
    <details class="q__exp" itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer">
      <summary>Model answer + full explanation</summary>
      <div class="q__exp-body" itemprop="text">${explanationToHtml(qObj.explanation)}</div>
    </details>
  </article>`;
}

function faqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function orgSchema(baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'DOHPass',
    url: baseUrl,
    description:
      'DOH, DHA and MOH medical licensing exam preparation for Internal Medicine Specialist and GP candidates in the UAE. Question bank authored by an MRCP-qualified doctor.',
  };
}

/**
 * Render a complete landing page.
 * @param {object} page   - PAGES config entry
 * @param {object[]} questions - sample questions from get_preview_questions
 * @param {string} countDisplay - e.g. "2,400+"
 * @param {object[]} faqs - [{q,a}]
 * @param {string} baseUrl - https://dohpass.com
 */
export function renderLandingPage({ page, questions, countDisplay, faqs, baseUrl }) {
  const url = `${baseUrl}/${page.slug}`;
  const topics = [...new Set(questions.map((q) => q.topic).filter(Boolean))].slice(0, 10);

  const ld = [orgSchema(baseUrl), faqSchema(faqs)];
  const ldHtml = ld
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`)
    .join('\n  ');

  const faqHtml = faqs
    .map(
      (f) => `<details class="faq__item">
      <summary>${esc(f.q)}</summary>
      <div class="faq__a"><p>${esc(f.a)}</p></div>
    </details>`
    )
    .join('');

  const topicsHtml = topics.length
    ? `<section class="band">
        <h2>Topics covered in this bank</h2>
        <ul class="chips">${topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </section>`
    : '';

  const questionsHtml = questions.length
    ? questions.map((q, i) => renderQuestion(q, i + 1)).join('')
    : `<p class="muted">Sample questions are loading. <a href="${esc(baseUrl)}/pricing">View the full question bank &rarr;</a></p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.metaDescription)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="author" content="DOHPass — MRCP-qualified clinical author" />
  <link rel="canonical" href="${esc(url)}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="DOHPass" />
  <meta property="og:title" content="${esc(page.title)}" />
  <meta property="og:description" content="${esc(page.metaDescription)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(page.title)}" />
  <meta name="twitter:description" content="${esc(page.metaDescription)}" />
  <meta name="theme-color" content="#0a0e1a" />

  ${ldHtml}

  <style>
    :root{
      --bg:#0a0e1a; --surface:#111726; --surface2:#0d1322; --line:#1f2940;
      --text:#e8edf7; --muted:#93a0b8; --gold:#e3b341; --gold2:#f2cf68;
      --green:#37c281; --radius:14px;
      --sans:'Poppins',system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    }
    *{box-sizing:border-box}
    html{-webkit-text-size-adjust:100%}
    body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);
      line-height:1.6;font-size:17px;-webkit-font-smoothing:antialiased}
    a{color:var(--gold2);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:760px;margin:0 auto;padding:0 20px}
    .muted{color:var(--muted)}

    header.site{border-bottom:1px solid var(--line);padding:16px 0;position:sticky;top:0;
      background:rgba(10,14,26,.85);backdrop-filter:blur(8px);z-index:5}
    .site__bar{display:flex;align-items:center;justify-content:space-between}
    .brand{font-weight:700;letter-spacing:.3px;font-size:19px;color:#fff}
    .brand b{color:var(--gold)}
    .navlink{font-size:14px;color:var(--muted)}

    .hero{padding:54px 0 30px}
    .eyebrow{color:var(--gold);font-weight:600;font-size:13px;letter-spacing:1.5px;
      text-transform:uppercase;margin:0 0 14px}
    h1{font-size:34px;line-height:1.18;margin:0 0 16px;font-weight:700;letter-spacing:-.4px}
    .lede{color:var(--muted);font-size:18px;margin:0 0 24px}
    .badges{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 26px}
    .badge{background:var(--surface);border:1px solid var(--line);border-radius:999px;
      padding:7px 14px;font-size:13.5px;color:var(--text)}
    .badge b{color:var(--gold)}
    .cta-row{display:flex;flex-wrap:wrap;gap:12px;margin:6px 0 0}
    .btn{display:inline-block;padding:14px 24px;border-radius:999px;font-weight:600;font-size:16px}
    .btn--gold{background:linear-gradient(180deg,var(--gold2),var(--gold));color:#1a1306}
    .btn--gold:hover{text-decoration:none;filter:brightness(1.05)}
    .btn--ghost{border:1px solid var(--line);color:var(--text)}
    .btn--ghost:hover{text-decoration:none;border-color:var(--gold)}

    section{padding:30px 0}
    h2{font-size:24px;margin:0 0 14px;letter-spacing:-.2px}
    .band{border-top:1px solid var(--line)}
    .chips{list-style:none;padding:0;margin:14px 0 0;display:flex;flex-wrap:wrap;gap:9px}
    .chips li{background:var(--surface2);border:1px solid var(--line);border-radius:8px;
      padding:6px 12px;font-size:14px;color:var(--muted)}

    .q{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
      padding:20px;margin:0 0 16px}
    .q__head{display:flex;align-items:center;gap:10px;margin:0 0 10px}
    .q__num{background:var(--gold);color:#1a1306;font-weight:700;font-size:13px;
      border-radius:6px;padding:3px 9px}
    .q__topic{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.5px}
    .q__stem{margin:0 0 16px;font-size:16.5px}
    .q__opts{list-style:none;padding:0;margin:0 0 16px;display:grid;gap:9px}
    .opt{display:grid;grid-template-columns:26px 1fr 22px;gap:10px;align-items:start;
      background:var(--surface2);border:1px solid var(--line);border-radius:10px;
      padding:11px 13px;font-size:15.5px}
    .opt__letter{font-weight:700;color:var(--muted)}
    .opt__tick{color:var(--green);font-weight:700;opacity:0;justify-self:end}
    .revealed .opt--correct{border-color:var(--green);background:rgba(55,194,129,.10)}
    .revealed .opt--correct .opt__letter{color:var(--green)}
    .revealed .opt--correct .opt__tick{opacity:1}
    .q__reveal{appearance:none;cursor:pointer;background:transparent;color:var(--gold2);
      border:1px solid var(--line);border-radius:999px;padding:9px 16px;font-size:14px;
      font-family:inherit;font-weight:600}
    .q__reveal:hover{border-color:var(--gold)}
    .revealed .q__reveal{display:none}
    .q__exp{margin:14px 0 0;display:none}
    .revealed .q__exp{display:block}
    .q__exp summary{cursor:pointer;color:var(--muted);font-size:14px;font-weight:600;
      padding:8px 0}
    .q__exp-body{border-top:1px solid var(--line);padding-top:12px;font-size:14.5px;color:#cdd6ea}
    .q__exp-body p{margin:0 0 12px}

    .trust{display:grid;gap:14px}
    .trust .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
      padding:18px}
    .trust .card h3{margin:0 0 6px;font-size:17px;color:#fff}
    .trust .card p{margin:0;color:var(--muted);font-size:15px}

    .faq__item{border:1px solid var(--line);border-radius:10px;margin:0 0 10px;background:var(--surface)}
    .faq__item summary{cursor:pointer;padding:15px 18px;font-weight:600;font-size:16px;list-style:none}
    .faq__item summary::-webkit-details-marker{display:none}
    .faq__item summary:after{content:'+';float:right;color:var(--gold);font-weight:700}
    .faq__item[open] summary:after{content:'\\2212'}
    .faq__a{padding:0 18px 16px;color:var(--muted);font-size:15px}
    .faq__a p{margin:0}

    .endcta{border-top:1px solid var(--line);text-align:center;padding:48px 0}
    .endcta h2{margin:0 0 10px}
    .endcta p{color:var(--muted);margin:0 0 22px}

    footer.site{border-top:1px solid var(--line);padding:28px 0 48px;color:var(--muted);font-size:14px}
    footer .links{display:flex;flex-wrap:wrap;gap:16px;margin:0 0 14px}

    @media(min-width:680px){ h1{font-size:42px} .hero{padding:70px 0 34px} }
  </style>
</head>
<body>
  <header class="site">
    <div class="wrap site__bar">
      <a class="brand" href="${esc(baseUrl)}/">DOH<b>Pass</b></a>
      <a class="navlink" href="${esc(baseUrl)}/pricing">Question bank &rarr;</a>
    </div>
  </header>

  <main>
    <div class="wrap">
      <section class="hero">
        <p class="eyebrow">${esc(page.eyebrow)}</p>
        <h1>${esc(page.h1)}</h1>
        <p class="lede">${esc(page.intro)}</p>
        <div class="badges">
          <span class="badge"><b>${esc(countDisplay)}</b> questions</span>
          <span class="badge">Written by an <b>MRCP</b> doctor</span>
          <span class="badge">Full explanations &amp; references</span>
        </div>
        <div class="cta-row">
          <a class="btn btn--gold" href="${esc(baseUrl)}/pricing">Get the full question bank</a>
          <a class="btn btn--ghost" href="https://beacons.ai/dohpass?utm_source=seo&utm_medium=hero&utm_campaign=mock50" target="_blank" rel="noopener">Free 50-question mock</a>
        </div>
      </section>
    </div>

    <div class="wrap">
      <section>
        <h2>Try ${questions.length} free sample questions</h2>
        <p class="muted">Real questions from the DOHPass bank, with the full clinical reasoning behind each answer. Tap to reveal.</p>
        <div class="qlist">${questionsHtml}</div>
      </section>
    </div>

    <div class="wrap">${topicsHtml}</div>

    <div class="wrap">
      <section class="band">
        <h2>Why candidates use DOHPass</h2>
        <div class="trust">
          <div class="card">
            <h3>Authored by a doctor who passed the exam</h3>
            <p>Every question is written and reviewed by an MRCP-qualified physician who has personally sat the DOH licensing exam &mdash; not scraped from leaked dumps.</p>
          </div>
          <div class="card">
            <h3>Explanations that actually teach</h3>
            <p>Each answer comes with the reasoning, the wrong-option traps, and the guideline or trial it rests on &mdash; so you learn the principle, not just the key.</p>
          </div>
          <div class="card">
            <h3>Specialist and GP tracks</h3>
            <p>Separate banks for Internal Medicine Specialist and General Practitioner candidates across DOH, DHA and MOH Prometric exams.</p>
          </div>
        </div>
      </section>
    </div>

    <div class="wrap">
      <section>
        <h2>Frequently asked questions</h2>
        <div class="faq">${faqHtml}</div>
      </section>
    </div>

    <div class="wrap">
      <section class="endcta">
        <h2>Ready to practise properly?</h2>
        <p>Start with the free 50-question mock, then unlock the full bank.</p>
        <div class="cta-row">
          <a class="btn btn--gold" href="https://beacons.ai/dohpass?utm_source=seo&utm_medium=endcta&utm_campaign=mock50" target="_blank" rel="noopener">Get the free 50-question mock</a>
          <a class="btn btn--ghost" href="${esc(baseUrl)}/pricing">See plans &amp; pricing</a>
        </div>
      </section>
    </div>
  </main>

  <footer class="site">
    <div class="wrap">
      <div class="links">
        <a href="${esc(baseUrl)}/pricing">Pricing</a>
        <a href="https://t.me/doh_dha_gp_internal_medicine" target="_blank" rel="noopener">Telegram</a>
        <a href="${esc(baseUrl)}/specialist">Specialist</a>
        <a href="${esc(baseUrl)}/gp">GP</a>
        <a href="${esc(baseUrl)}/about">About</a>
        <a href="${esc(baseUrl)}/contact">Contact</a>
      </div>
      <div>&copy; ${new Date().getFullYear()} DOHPass. DOH, DHA &amp; MOH exam preparation. Practice questions for educational use; not affiliated with any licensing authority.</div>
    </div>
  </footer>

  <script>
    // Progressive enhancement only — all content is already in the HTML above.
    document.querySelectorAll('.q__reveal').forEach(function(btn){
      btn.addEventListener('click', function(){
        var card = btn.closest('.q');
        card.classList.add('revealed');
        btn.setAttribute('aria-expanded','true');
        var d = card.querySelector('.q__exp'); if(d) d.open = true;
      });
    });
  </script>
</body>
</html>`;
}

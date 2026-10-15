/*
 * formatExplanation(text) → Block[]
 *
 * Turns a stored explanation (often one 1,000+ character paragraph) into
 * readable blocks at display time. The stored text is never modified, and
 * every character of the input ends up in exactly one block — nothing is
 * dropped, only regrouped.
 *
 * Block types:
 *   { type: 'answer',  label, text }   "Why correct …" section
 *   { type: 'para',    label?, text }  ordinary paragraph
 *   { type: 'options', items: [{ label?, text }] }  why the other options are wrong
 *   { type: 'pearl',   label, text }   clinical pearl / key learning point
 *   { type: 'ref',     label, text }   reference line
 *   { type: 'list',    items: [string] }  bullet lines that were already in the text
 */

const LABEL_RE =
  /^(why correct[^:\n]{0,80}|why (?:option |answer )?[a-e]\b[^:\n]{0,80}|why not[^:\n]{0,60}|distractors?[^:\n]{0,30}|other options[^:\n]{0,20}|key learning point|key teaching point|key point|clinical pearl|pearl|exam tip|high[- ]yield[^:\n]{0,20}|references?|management|mechanism|bottom line)\s*:\s*/i

const OPTION_START_RE =
  /^(?:why (?:option |answer )?[a-e]\b|option[s]? [a-e]\b|answer [a-e]\b|choice [a-e]\b|\(?[a-e]\)? (?:is|was) (?:incorrect|wrong|not)|why not)/i

// An "Option X …" sentence that argues FOR an option is not a distractor.
const SAYS_CORRECT_RE =
  /\b(?:is|was)\s+(?:therefore\s+|thus\s+|hence\s+)?(?:the\s+)?(?:correct|right|best|preferred|most appropriate|answer)\b|\bcorrectly\b|\bcaptures\b|\bmatches\b/i

function isDistractorSentence(s, correctLetter) {
  if (!OPTION_START_RE.test(s)) return false
  if (SAYS_CORRECT_RE.test(s)) return false
  if (correctLetter) {
    const m = s.match(/^(?:why (?:option |answer )?|option |answer |choice |\(?)([a-e])\b/i)
    if (m && m[1].toUpperCase() === String(correctLetter).trim().toUpperCase()) return false
  }
  return true
}

const CONTINUATION_RE =/^(however|but|this|it|although|here|instead|thus|therefore|in this|that|while)\b/i

// Words that end with a period but do not end a sentence.
const ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'vs', 'dr', 'approx', 'fig', 'al', 'etc', 'mr', 'mrs', 'ms',
  'no', 'st', 'cf', 'ca', 'inc', 'jr', 'sr', 'resp', 'max', 'min',
])

function classifyLabel(label) {
  const l = label.toLowerCase()
  if (l.startsWith('why correct')) return 'answer'
  if (/^why (?:option |answer )?[a-e]\b/.test(l) || l.startsWith('why not') ||
      l.startsWith('distractor') || l.startsWith('other options')) return 'option'
  if (/pearl|key (?:learning |teaching )?point|exam tip|high[- ]yield|bottom line/.test(l)) return 'pearl'
  if (l.startsWith('reference')) return 'ref'
  return 'para'
}

function prettyLabel(label, kind) {
  if (kind === 'pearl') return /key/i.test(label) ? 'Key learning point' : 'Clinical pearl'
  if (kind === 'ref') return 'Reference'
  if (kind === 'answer') {
    // keep any "(Option D — …)" detail the author wrote
    const detail = label.replace(/^why correct\s*/i, '').trim()
    return detail ? `Why it's correct ${detail}` : "Why it's correct"
  }
  return label.trim()
}

// Split a paragraph into sentences without breaking on "e.g.", "vs.",
// decimals ("0.5") or ratios. Only splits on . ! ? followed by space and a
// capital letter, digit-free opening, or an opening parenthesis.
export function splitSentences(text) {
  const out = []
  let start = 0
  const re = /[.!?](?=\s+[A-Z(])/g
  let m
  while ((m = re.exec(text)) !== null) {
    const end = m.index + 1
    const before = text.slice(start, m.index)
    const lastWord = (before.match(/([A-Za-z.]+)$/) || [, ''])[1].toLowerCase()
    if (ABBREVIATIONS.has(lastWord) || /(?:^|\s)[A-Z]$/.test(before) && !/\b(?:option|answer|choice|class|type|stage|grade|group|vitamin|hepatitis)\s+[A-Z]$/i.test(before)) continue
    out.push(text.slice(start, end).trim())
    start = end
  }
  const tail = text.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

function pushOption(blocks, item) {
  const last = blocks[blocks.length - 1]
  if (last && last.type === 'options') last.items.push(item)
  else blocks.push({ type: 'options', items: [item] })
}

// Group free sentences into short paragraphs (≈2 sentences / ~380 chars).
function chunk(sentences) {
  const paras = []
  let cur = []
  let len = 0
  for (const s of sentences) {
    if (cur.length && (cur.length >= 2 || len + s.length > 380)) {
      paras.push(cur.join(' '))
      cur = []
      len = 0
    }
    cur.push(s)
    len += s.length
  }
  if (cur.length) paras.push(cur.join(' '))
  return paras
}

// Break one unlabelled (or "why correct") paragraph into blocks.
function explodeParagraph(text, blocks, firstLabel, correctLetter) {
  const sentences = splitSentences(text)
  let free = []
  let mode = null // 'option' | 'pearl'
  let pearl = null
  let answerLabelUsed = false

  const flushFree = () => {
    if (!free.length) return
    chunk(free).forEach((p) => {
      if (firstLabel && !answerLabelUsed) {
        blocks.push({ type: 'answer', label: firstLabel, text: p })
        answerLabelUsed = true
      } else {
        blocks.push({ type: 'para', text: p })
      }
    })
    free = []
  }

  for (const s of sentences) {
    const lab = s.match(LABEL_RE)
    if (lab) {
      const kind = classifyLabel(lab[1])
      const body = s.slice(lab[0].length)
      if (kind === 'pearl') {
        flushFree()
        pearl = { type: 'pearl', label: prettyLabel(lab[1], kind), text: body }
        blocks.push(pearl)
        mode = 'pearl'
        continue
      }
      if (kind === 'ref') {
        flushFree()
        blocks.push({ type: 'ref', label: 'Reference', text: body })
        mode = null
        continue
      }
      if (kind === 'option') {
        flushFree()
        pushOption(blocks, { label: lab[1].trim(), text: body })
        mode = 'option'
        continue
      }
    }
    if (mode === 'pearl') { pearl.text += ' ' + s; continue }
    if (isDistractorSentence(s, correctLetter)) {
      flushFree()
      pushOption(blocks, { text: s })
      mode = 'option'
      continue
    }
    if (mode === 'option' && CONTINUATION_RE.test(s)) {
      const opts = blocks[blocks.length - 1]
      opts.items[opts.items.length - 1].text += ' ' + s
      continue
    }
    mode = null
    free.push(s)
  }
  flushFree()
}

export function formatExplanation(raw, correctLetter = null) {
  if (!raw || typeof raw !== 'string') return []
  const text = raw.replace(/\r\n?/g, '\n').trim()
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const blocks = []

  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean)

    // Lines that are already bullets → keep them as a list; any non-bullet
    // lines around them (e.g. a "Key features:" heading) stay as paragraphs.
    const BULLET = /^([•\-*–]|\d+[.)])\s+/
    if (lines.length > 1 && lines.some((l) => BULLET.test(l))) {
      let run = []
      const flushRun = () => { if (run.length) { blocks.push({ type: 'list', items: run }); run = [] } }
      for (const l of lines) {
        if (BULLET.test(l)) run.push(l.replace(BULLET, ''))
        else { flushRun(); blocks.push({ type: 'para', text: l }) }
      }
      flushRun()
      continue
    }
    // A single line break still marks a new paragraph (the old pre-wrap
    // rendering honoured it), so treat each line on its own.
    for (const flat of lines) formatLine(flat, blocks, correctLetter)
  }
  return blocks
}

function formatLine(flat, blocks, correctLetter) {
  {
    const lab = flat.match(LABEL_RE)
    if (lab) {
      const kind = classifyLabel(lab[1])
      const body = flat.slice(lab[0].length)
      if (kind === 'option') { pushOption(blocks, { label: lab[1].trim(), text: body }); return }
      if (kind === 'pearl')  { blocks.push({ type: 'pearl', label: prettyLabel(lab[1], kind), text: body }); return }
      if (kind === 'ref')    { blocks.push({ type: 'ref', label: 'Reference', text: body }); return }
      if (kind === 'answer') { explodeParagraph(body, blocks, prettyLabel(lab[1], kind), correctLetter); return }
      blocks.push({ type: 'para', label: lab[1].trim(), text: body })
      return
    }
    explodeParagraph(flat, blocks, null, correctLetter)
  }
}

// For tests: every word of the input must survive formatting.
export function blocksToText(blocks) {
  return blocks.map((b) => {
    if (b.type === 'options') return b.items.map((i) => `${i.label || ''} ${i.text}`).join(' ')
    if (b.type === 'list') return b.items.join(' ')
    return `${b.label || ''} ${b.text}`
  }).join(' ')
}

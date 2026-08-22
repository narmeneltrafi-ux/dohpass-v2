# DOH IM Revision Pack — design canvas

Nine A4 artboards (794 × 1123 px) for the DOH Internal Medicine specialist exam,
laid out on a three-page canvas and published as an Artifact.

Published at: https://claude.ai/code/artifact/bc351436-b636-4939-b263-3418b3f549bd

## Sheets

| Page | Artboard | Contents |
|---|---|---|
| Blueprint & plan | `Main.dc.html` | Ten systems sized by exam weight, with the high-yield subtopics in each |
| Blueprint & plan | `Countdown.dc.html` | Six-week study plan and the daily rhythm |
| Cram sheets | `CramNumbers.dc.html` | Cutoffs and thresholds by system |
| Cram sheets | `CramDrugs.dc.html` | First-line choice and the comorbidity that changes it |
| Cram sheets | `CramTriggers.dc.html` | Stem phrase → diagnosis → next move |
| Algorithm cards | `AlgoCardioResp.dc.html` | ACS, AF with fast ventricular rate, PE |
| Algorithm cards | `AlgoMetabolic.dc.html` | DKA/HHS, hyperkalaemia, hyponatraemia |
| Algorithm cards | `AlgoSepsisGI.dc.html` | Sepsis, upper GI bleed, AKI |
| Algorithm cards | `AlgoOncology.dc.html` | Neutropenic sepsis, TLS, hypercalcaemia, cord compression, SVCO |

`canvas.json` holds the page split, artboard positions and the two sticky notes.

## Sources for the content

- Blueprint weights: the `BLUEPRINT.specialist` constant in `src/pages/Analytics.jsx`.
  DOH publishes no official weighting — these are estimates, as `BlueprintGapAgent`
  states in its own UI copy.
- Pass mark (60%): `computePassProb` in `src/pages/Analytics.jsx`.
- Visual system: `src/index.css` design tokens — gold `#c9a84c`, action teal `#14b8a6`,
  blue `#3b82f6`, surfaces `#07070e` / `#0c0c16`, Inter + Playfair Display, 16/10/7 px radii.

## Regenerating the canvas

The published `.html` is a seeded copy of the Claude Design canvas payload and is
gitignored. To rebuild it after editing any artboard:

```
node "<design skill base dir>/seed-canvas.mjs" \
  --template "<design skill base dir>/payload.template.html" \
  --out doh-im-exam-revision-pack.html \
  --title "DOH IM Revision Pack" \
  --artboard Main.dc.html --artboard Countdown.dc.html \
  --artboard CramNumbers.dc.html --artboard CramDrugs.dc.html --artboard CramTriggers.dc.html \
  --artboard AlgoCardioResp.dc.html --artboard AlgoMetabolic.dc.html \
  --artboard AlgoSepsisGI.dc.html --artboard AlgoOncology.dc.html \
  --canvas canvas.json
```

Then republish the same file path to keep the existing URL.

## Offline PDF

`build-pdf.py` renders the nine artboards into one 9-page A4 PDF with embedded
fonts and selectable text — for reading on a phone or tablet, where the canvas
itself is too heavy to open (the published page carries a ~2.3 MB editor).

```
python3 build-pdf.py            # -> DOH-IM-Revision-Pack.pdf
```

It needs Chromium and, on first run, network access to fetch the fonts (cached
in `.fontcache/` afterwards). Two details that are easy to get wrong:

- It requests **static** font weights from the v1 Google Fonts API. The `css2`
  API serves variable-font woff2, which Chromium's print path refuses to embed —
  it silently falls back to Arial and the PDF stops matching the design.
- Each sheet's CSS is scoped to its own `#sN` before the sheets are concatenated.
  They reuse class names (`.r`, `.sec`) with different definitions per sheet, so
  unscoped concatenation would cross-contaminate the layouts.

## Layout constraint

Each artboard is a fixed 794 × 1123 frame with `overflow: hidden`, so content that
grows past 1123 px is clipped rather than shrunk. Every sheet currently renders
between 991 and 1060 px measured with ~1.8% extra letter-spacing as a
wider-font stress test. Keep that headroom when editing.

## Clinical caveat

Consensus guideline-level values for exam revision. Local Abu Dhabi and hospital
protocols take precedence in clinical practice, and guideline editions move —
re-check anything before relying on it.

#!/usr/bin/env python3
"""Render the nine .dc.html artboards into one 9-page A4 PDF with selectable text.

Why this exists: the published canvas exports PDFs by rasterising each artboard,
and the canvas itself is too heavy to open on a phone. This produces a small
vector PDF instead — real embedded fonts, real selectable text.

Requires Chromium and network access for the fonts (cached after first run).
Usage:  python3 build-pdf.py [--out DOH-IM-Revision-Pack.pdf]
"""
import argparse, base64, json, pathlib, re, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / ".fontcache"
# Static (non-variable) weights: Chromium's print path will not embed the
# variable-font woff2 that the css2 API serves, and silently falls back to Arial.
FONT_CSS_URL = ("https://fonts.googleapis.com/css"
                "?family=Inter:400,600,700,800|Playfair+Display:700")
CHROME_CANDIDATES = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]
PAGE_W, PAGE_H = 794, 1123          # A4 at 96 css px per inch
RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
HOISTED = {"body", "a", "a:hover"}   # defined once globally instead of per sheet


def find_chrome():
    for path in CHROME_CANDIDATES:
        if pathlib.Path(path).exists():
            return path
    sys.exit("No Chromium found. Set one of: " + ", ".join(CHROME_CANDIDATES))


def fetch(url, binary=True):
    out = subprocess.run(["curl", "-sSfL", url], capture_output=True)
    if out.returncode:
        sys.exit(f"curl failed for {url}: {out.stderr.decode()[:200]}")
    return out.stdout if binary else out.stdout.decode()


def font_css():
    """Google Fonts CSS with every font file inlined as a data: URI."""
    CACHE.mkdir(exist_ok=True)
    cached = CACHE / "fonts-static.css"
    if cached.exists():
        return cached.read_text()
    css = fetch(FONT_CSS_URL, binary=False)
    for url in sorted(set(re.findall(r"https://fonts\.gstatic\.com[^)]*", css))):
        data = fetch(url)
        css = css.replace(url, "data:font/ttf;base64," + base64.b64encode(data).decode())
    # `block`, not `swap`: headless print can otherwise snapshot before the swap.
    css = css.replace("@font-face {", "@font-face {\n  font-display: block;")
    cached.write_text(css)
    return css


def scope(style, sheet_id):
    """Prefix every selector with #sheet_id — sheets reuse class names (.r, .sec)
    with different definitions, so concatenating them unscoped would collide."""
    rules = []
    for selector, decls in RULE.findall(style):
        parts = [p.strip() for p in selector.strip().split(",") if p.strip()]
        kept = [p for p in parts if p not in HOISTED]
        if kept:
            rules.append(", ".join(f"#{sheet_id} {p}" for p in kept) + " {" + decls + "}")
    return "\n".join(rules)


def build_html():
    order = [a["file"] for a in json.loads((HERE / "canvas.json").read_text())["artboards"]]
    sections, styles = [], []
    for i, name in enumerate(order, 1):
        src = (HERE / name).read_text()
        style = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
        body = src.split("</helmet>", 1)[1].split("</x-dc>", 1)[0].strip()
        if not body.startswith(f'<div style="width: {PAGE_W}px; height: {PAGE_H}px;'):
            sys.exit(f"{name}: root element is not a {PAGE_W}x{PAGE_H} frame")
        styles.append(f"/* {name} */\n" + scope(style, f"s{i}"))
        sections.append(f'<section id="s{i}" class="pg">\n{body}\n</section>')
    nl = "\n"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>DOH IM Revision Pack</title>
<style>
{font_css()}
@page {{ size: {PAGE_W / 96:.4f}in {PAGE_H / 96:.4f}in; margin: 0; }}
html, body {{ margin: 0; padding: 0; background: #07070e;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }}
* {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
a {{ color: #c9a84c; text-decoration: none; }}
.pg {{ width: {PAGE_W}px; height: {PAGE_H}px; overflow: hidden;
  break-after: page; page-break-after: always; }}
.pg:last-child {{ break-after: auto; page-break-after: auto; }}
{nl.join(styles)}
</style></head><body>
{nl.join(sections)}
</body></html>""", len(sections)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "DOH-IM-Revision-Pack.pdf"))
    args = ap.parse_args()

    html, pages = build_html()
    out = pathlib.Path(args.out).resolve()
    with tempfile.TemporaryDirectory() as tmp:
        page = pathlib.Path(tmp) / "print.html"
        page.write_text(html)
        subprocess.run([find_chrome(), "--headless", "--disable-gpu", "--no-sandbox",
                        "--no-pdf-header-footer", "--virtual-time-budget=15000",
                        f"--print-to-pdf={out}", page.as_uri()],
                       check=True, capture_output=True)
    print(f"wrote {out} — {pages} pages, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

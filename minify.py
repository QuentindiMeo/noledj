"""
minify.py
Minifie avancement.html → avancement.min.html

Usage:
    python minify.py
    python minify.py --stats   # affiche les stats sans écrire
"""

import re
import sys
import zlib
from pathlib import Path

SRC  = Path(__file__).parent / "avancement.html"
DEST = Path(__file__).parent / "avancement.min.html"


# ── CSS ───────────────────────────────────────────────────────────────────────
def minify_css(css: str) -> str:
    css = re.sub(r"/\*[\s\S]*?\*/", "", css)           # comments
    css = re.sub(r"\s+", " ", css)                      # collapse whitespace
    css = re.sub(r"\s*([{}:;,>~+])\s*", r"\1", css)    # spaces around punctuation
    css = re.sub(r";}", "}", css)                        # trailing semicolons
    css = re.sub(r"0\.([\d]+)", r".\1", css)             # 0.5 → .5
    return css.strip()


# ── JS ────────────────────────────────────────────────────────────────────────
def minify_js(js: str) -> str:
    out_lines: list[str] = []
    in_template = 0  # nesting depth of template literals

    for line in js.split("\n"):
        stripped = line.strip()

        # Track template literal depth (rough heuristic — sufficient for this file)
        in_template += stripped.count("`") - stripped.count("\\`")

        # Drop pure single-line comment lines (safe: COURSES JSON is one long line,
        # never starts with //)
        if stripped.startswith("//") and in_template <= 0:
            continue

        # Inside template literals keep indentation; outside strip it
        if in_template > 0:
            out_lines.append(line.rstrip())
        else:
            if stripped:
                out_lines.append(stripped)
            # skip blank lines outside template literals

    js = "\n".join(out_lines)
    js = re.sub(r"\n{3,}", "\n", js)
    return js.strip()


# ── HTML ──────────────────────────────────────────────────────────────────────
def minify_html(html: str) -> str:
    html = re.sub(r"<!--[\s\S]*?-->", "", html)   # HTML comments
    html = re.sub(r">\s+<", "><", html)            # whitespace between tags
    html = re.sub(r"  +", " ", html)               # multiple spaces
    return html.strip()


# ── ORCHESTRATION ─────────────────────────────────────────────────────────────
def minify(src: str) -> str:
    # <style> blocks
    src = re.sub(
        r"<style>([\s\S]*?)</style>",
        lambda m: f"<style>{minify_css(m.group(1))}</style>",
        src,
    )
    # <script> blocks (there is exactly one)
    src = re.sub(
        r"<script>([\s\S]*?)</script>",
        lambda m: f"<script>{minify_js(m.group(1))}</script>",
        src,
    )
    # HTML structure
    src = minify_html(src)
    return src


def fmt(n: int) -> str:
    """Format bytes as Ko or Mo."""
    if n >= 1_000_000:
        return f"{n/1_000_000:.2f} Mo"
    return f"{n/1_000:.0f} Ko"


def gzip_size(data: bytes) -> int:
    return len(zlib.compress(data, level=9))


if __name__ == "__main__":
    stats_only = "--stats" in sys.argv

    original  = SRC.read_text(encoding="utf-8")
    minified  = minify(original)

    orig_bytes = original.encode("utf-8")
    mini_bytes = minified.encode("utf-8")
    saving_pct = (1 - len(mini_bytes) / len(orig_bytes)) * 100

    print(f"Original  : {fmt(len(orig_bytes))}  (gzip : {fmt(gzip_size(orig_bytes))})")
    print(f"Minifié   : {fmt(len(mini_bytes))}  (gzip : {fmt(gzip_size(mini_bytes))})")
    print(f"Gain      : {saving_pct:.1f}%")

    if stats_only:
        print("[--stats] Aucun fichier écrit.")
    else:
        DEST.write_text(minified, encoding="utf-8")
        print(f"Écrit     : {DEST}")

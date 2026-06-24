"""
inject_courses.py
Génère l'index des cours (titre + chemin relatif) et l'injecte dans avancement.html.
Le contenu Markdown reste sur disque et est chargé à la volée par le navigateur.
Remplace `const COURSES = {};` par l'index `{sid: [{title, path}, ...]}`.

Usage:
    python inject_courses.py
    python inject_courses.py --dry-run   # affiche le résumé sans écrire
"""

import json
import re
import sys
from pathlib import Path

ROOT      = Path(__file__).parent
COURSES   = ROOT / "cours"
HTML_FILE = ROOT / "avancement.html"
PLACEHOLDER = "const COURSES = {};"

# ── Mapping session → modules ──────────────────────────────────────────────
# Chaque entrée : session_id → liste de (dossier_relatif, [fichiers])
# Le dossier est relatif à cours/
SESSION_MODULES: dict[str, list[tuple[str, list[str]]]] = {
    # Phase 1 — Python
    "s01": [("priorite0/Python", ["Module-01.md", "Module-02.md", "Module-03.md"])],
    "s02": [("priorite0/Python", ["Module-04.md", "Module-05.md", "Module-06.md"])],
    "s03": [("priorite0/Python", ["Module-07+P.md"])],

    # Phase 1 — React
    "s04": [("priorite0/React", ["Module-01.md", "Module-02.md", "Module-03.md"])],
    "s05": [("priorite0/React", ["Module-04.md", "Module-05.md", "Module-06+P.md"])],
    "s06": [("priorite1/Architecture Logicielle", ["Module-01.md"])],

    # Phase 1 — Architecture Logicielle
    "s07": [("priorite1/Architecture Logicielle", ["Module-02.md", "Module-03.md", "Module-04.md"])],
    "s08": [("priorite1/Architecture Logicielle", ["Module-05.md", "Module-06+P.md"])],

    # Phase 1 — Tests Unitaires
    "s09": [("priorite1/Tests unitaires", ["Module-01.md", "Module-02.md"])],
    "s10": [("priorite1/Tests unitaires", ["Module-03.md", "Module-04.md", "Module-05.md"])],
    "s11": [("priorite1/Tests unitaires", ["Module-06.md", "Module-07.md"])],
    "s12": [("priorite1/Tests unitaires", ["Module-08.md", "Module-09+P.md"])],

    # Phase 2 — POO
    "s13": [("priorite0/POO", ["Module-01.md", "Module-02.md", "Module-03.md"])],
    "s14": [("priorite0/POO", ["Module-04.md", "Module-05.md", "Module-06.md"])],
    "s15": [("priorite0/POO", ["Module-07.md", "Module-08.md", "Module-09.md", "Module-10.md"])],
    "s16": [("priorite0/POO", ["Module-11.md", "Module-12.md"])],

    # Phase 2 — FastAPI
    "s17": [("priorite0/FastAPI", ["Module-01.md", "Module-02.md"])],
    "s18": [("priorite0/FastAPI", ["Module-03.md", "Module-04.md", "Module-05.md",
                                  "Module-06.md", "Module-07.md"])],
    "s19": [("priorite0/FastAPI", ["Module-08.md", "Module-09.md", "Module-10.md"])],
    "s20": [("priorite0/FastAPI", ["Module-11.md", "Module-12+P.md", "Module-13.md"])],
    # s21 : révision — pas de nouveaux fichiers

    # Phase 3 — AWS Identity
    "s22": [("priorite1/AWS Identity", ["Module-01.md", "Module-02.md", "Module-03.md"])],
    "s23": [("priorite1/AWS Identity", ["Module-04.md", "Module-05.md", "Module-06.md"])],
    "s24": [("priorite1/AWS Identity", ["Module-07.md", "Module-08.md",
                                       "Module-09.md", "Module-10.md"])],
    "s25": [("priorite1/AWS Identity", ["Projet.md"])],

    # Phase 3 — AWS Compute
    "s26": [("priorite1/AWS Compute, Container et Orchestration",
             ["Module-01.md", "Module-02.md", "Module-03.md"])],
    "s27": [("priorite1/AWS Compute, Container et Orchestration",
             ["Module-04.md", "Module-05.md", "Module-06.md", "Module-07.md"])],
    "s28": [("priorite1/AWS Compute, Container et Orchestration",
             ["Module-08.md", "Module-09.md", "Module-10.md"])],
    "s29": [("priorite1/AWS Compute, Container et Orchestration",
             ["Module-11.md", "Module-12+P.md"])],

    # Phase 3 — AWS Networking
    "s30": [("priorite1/AWS Networking",
             ["Module-01.md", "Module-02.md", "Module-03.md", "Module-04.md"])],
    "s31": [("priorite1/AWS Networking", ["Module-05.md", "Module-06.md", "Module-07.md"])],
    "s32": [("priorite1/AWS Networking", ["Module-08+P.md"])],

    # Phase 3 — AWS Database et Storage
    "s33": [("priorite1/AWS Database et Storage",
             ["Module-01.md", "Module-02.md", "Module-03.md", "Module-04.md"])],
    "s34": [("priorite1/AWS Database et Storage",
             ["Module-05.md", "Module-06.md", "Module-07.md"])],
    "s35": [("priorite1/AWS Database et Storage", ["Module-08+P.md"])],
    # s36 : buffer — pas de fichiers

    # Phase 4 — SQL
    "s37": [("priorite2/SQL", ["Module-01.md", "Module-02.md",
                              "Module-03.md", "Module-04.md"])],
    "s38": [("priorite2/SQL", ["Module-05.md", "Module-06.md",
                              "Module-07.md", "Module-08.md"])],
    "s39": [("priorite2/SQL", ["Module-09.md", "Module-10.md",
                              "Module-11.md", "Module-12.md"])],
    # s40 : SQL mini-projet pratique — pas de fichier dédié

    # Phase 4 — AWS Analytics
    "s41": [("priorite1/AWS Analytics", ["Module-01.md", "Module-02.md", "Module-03.md"])],
    "s42": [("priorite1/AWS Analytics", ["Module-04.md", "Module-05.md", "Module-06.md",
                                        "Module-07.md", "Module-08+P.md"])],
    # s43 : Analytics mini-projet — contenu dans Module-08+P déjà en s42

    # Phase 4 — AWS Kinesis
    "s44": [("priorite1/AWS Kinesis", ["Module-01.md", "Module-02.md", "Module-03+P.md"])],
    # s45 : Kinesis mini-projet — contenu dans Module-03+P déjà en s44

    # Phase 5 (s46-s59) : Senior push — pas de fichiers de cours dédiés
}


def extract_title(content: str, filename: str) -> str:
    """Extrait le titre H1 de la première ligne du fichier."""
    first = content.split("\n", 1)[0].strip()
    title = re.sub(r"^#+\s*", "", first)
    return title if title else filename.replace(".md", "")


def read_module_meta(course_dir: str, filename: str) -> dict[str, str] | None:
    path = COURSES / course_dir / filename
    if not path.exists():
        print(f"  ⚠  ABSENT : {path.relative_to(ROOT)}")
        return None
    # Read only the first line for the title — the body stays on disk.
    with path.open(encoding="utf-8") as f:
        first_line = f.readline()
    return {
        "title": extract_title(first_line, filename),
        "path": path.relative_to(ROOT).as_posix(),
    }


def build_index() -> dict[str, list[dict[str, str]]]:
    index: dict[str, list[dict[str, str]]] = {}
    for sid, groups in SESSION_MODULES.items():
        modules: list[dict[str, str]] = []
        for course_dir, filenames in groups:
            for fname in filenames:
                meta = read_module_meta(course_dir, fname)
                if meta:
                    modules.append(meta)
        if modules:
            index[sid] = modules
    return index


def inject(index: dict[str, list[dict[str, str]]], dry_run: bool = False) -> None:
    html = HTML_FILE.read_text(encoding="utf-8")

    if PLACEHOLDER not in html:
        # Re-runs: match the whole single-line `const COURSES = {...};` greedily,
        # so embedded `};` inside markdown samples don't truncate the match.
        existing = re.search(r"const COURSES = \{[^\n]*\};", html)
        if not existing:
            print(f"❌  Placeholder '{PLACEHOLDER}' introuvable dans {HTML_FILE.name}")
            print("   Assurez-vous que avancement.html contient cette ligne ou un index existant.")
            sys.exit(1)
        target = existing.group(0)
    else:
        target = PLACEHOLDER

    courses_js = "const COURSES = " + json.dumps(
        index, ensure_ascii=False, separators=(",", ":")
    ) + ";"

    updated = html.replace(target, courses_js, 1)

    total_modules = sum(len(v) for v in index.values())
    size_kb       = len(updated.encode("utf-8")) / 1024

    print(f"\n✅  {len(index)} sessions · {total_modules} modules indexés")
    print(f"   Taille finale du HTML : {size_kb:.0f} Ko (contenu Markdown chargé à la volée)")

    if dry_run:
        print("   [dry-run] Aucun fichier écrit.")
        return

    HTML_FILE.write_text(updated, encoding="utf-8")
    print(f"   Écrit dans : {HTML_FILE}")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    print(f"{'[dry-run] ' if dry_run else ''}Indexation des cours depuis {COURSES}…\n")
    index = build_index()
    inject(index, dry_run=dry_run)

#!/usr/bin/env python3
"""Genera las constantes de scoring en TypeScript desde el Python.

El backend no puede transcribir a mano SKILL_KEYWORDS, las listas de
descalificadores y los pesos: cualquier letra que se pierda hace que el score de
la app y el del ranker digan cosas distintas sobre la misma oferta. Este script
importa los modulos reales y emite el archivo .ts, asi que las constantes tienen
una sola fuente y se regeneran en vez de mantenerse en dos lugares.

Uso:
    python3 tools/generate_ts_scoring_rules.py --out <ruta>/vacancy-rules.generated.ts
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import rank_live_vacancies as ranker  # noqa: E402
import shortlist_remote_companies as shortlist  # noqa: E402

# (nombre en Python, nombre en TS)
LIST_CONSTANTS = [
    # Del ranker: las listas de palabras que deciden.
    ("TITLE_ROLE_SIGNAL", "TITLE_ROLE_SIGNAL"),
    ("TITLE_ANY_SIGNAL", "TITLE_ANY_SIGNAL"),
    ("TS_JS_SIGNAL", "TS_JS_SIGNAL"),
    ("OUTSIDER_TITLE", "OUTSIDER_TITLE"),
    ("MOBILE_PRIMARY", "MOBILE_PRIMARY"),
    ("WEB_STACK_IN_TITLE", "WEB_STACK_IN_TITLE"),
    ("MANAGEMENT_TITLE", "MANAGEMENT_TITLE"),
    ("BELOW_SENIOR_TITLE", "BELOW_SENIOR_TITLE"),
    ("SENIOR_TITLE", "SENIOR_TITLE"),
    ("NO_SPONSORSHIP", "NO_SPONSORSHIP"),
    ("RESIDENCY_OR_CLEARANCE", "RESIDENCY_OR_CLEARANCE"),
    ("ONSITE_PRESENCE", "ONSITE_PRESENCE"),
    ("RELOCATION_OFFERED", "RELOCATION_OFFERED"),
    ("REMOTE_SIGNAL", "REMOTE_SIGNAL"),
    ("YEARS_SOFT_CUES", "YEARS_SOFT_CUES"),
    ("OTHER_STACK_LANGUAGES", "OTHER_STACK_LANGUAGES"),
]

NUMBER_CONSTANTS = [
    ("BODY_STACK_CAP", "BODY_STACK_CAP"),
    ("TITLE_PRIMARY_BONUS", "TITLE_PRIMARY_BONUS"),
    ("TITLE_OTHER_BONUS", "TITLE_OTHER_BONUS"),
    ("TITLE_ROLE_BONUS", "TITLE_ROLE_BONUS"),
    ("TITLE_SENIOR_BONUS", "TITLE_SENIOR_BONUS"),
    ("REMOTE_BONUS", "REMOTE_BONUS"),
    ("SPONSORSHIP_BONUS", "SPONSORSHIP_BONUS"),
    ("FRESH_BONUS", "FRESH_BONUS"),
    ("FRESH_DAYS", "FRESH_DAYS"),
    ("DEFAULT_YEARS_FLOOR", "DEFAULT_YEARS_FLOOR"),
    ("SENIOR_TITLE_YEARS_FLOOR", "SENIOR_TITLE_YEARS_FLOOR"),
    ("PRIMARY_WEIGHT", "PRIMARY_WEIGHT"),
    ("FRESH_MONTHS", "FRESH_MONTHS"),
]


def ts_value(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, (list, tuple)):
        return "[\n  " + ",\n  ".join(ts_value(item) for item in value) + ",\n]"
    if isinstance(value, dict):
        items = ",\n  ".join(f"{json.dumps(k)}: {ts_value(v)}" for k, v in value.items())
        return "{\n  " + items + ",\n}"
    raise TypeError(f"no se como emitir {type(value)}: {value!r}")


def skill_keywords_block() -> str:
    """SKILL_KEYWORDS con las claves en el orden del Python."""
    entries = []
    for skill, keywords in shortlist.SKILL_KEYWORDS.items():
        entries.append(f"  {json.dumps(skill)}: {ts_value(list(keywords))}")
    return "{\n" + ",\n".join(entries) + ",\n}"


def depth_to_weight_block() -> str:
    pairs = []
    for depth_key, weight in shortlist.DEPTH_TO_WEIGHT:
        pairs.append(f"  [{json.dumps(depth_key)}, {ts_value(weight)}]")
    return "[\n" + ",\n".join(pairs) + ",\n]"


def stack_weight_block() -> str:
    entries = []
    for key, weight in shortlist.STACK_WEIGHT.items():
        entries.append(f"  {json.dumps(key)}: {ts_value(weight)}")
    return "{\n" + ",\n".join(entries) + ",\n}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    lines = [
        "/**",
        " * GENERADO POR tools/generate_ts_scoring_rules.py. NO EDITAR A MANO.",
        " *",
        " * Las constantes salen del Python real (rank_live_vacancies.py y",
        " * shortlist_remote_companies.py), que es donde viven las reglas. Transcribirlas",
        " * a mano dejaria dos verdades y el score de la app empezaria a diferir del",
        " * ranker sin que nada lo avise. Para cambiar una regla se cambia el Python y se",
        " * regenera.",
        " */",
        "",
    ]

    for py_name, ts_name in NUMBER_CONSTANTS:
        value = getattr(ranker, py_name, None)
        if value is None:
            value = getattr(shortlist, py_name, None)
        if value is None:
            raise SystemExit(f"no encontre la constante {py_name}")
        lines.append(f"export const {ts_name} = {ts_value(value)};")

    lines.append("")
    for py_name, ts_name in LIST_CONSTANTS:
        value = getattr(ranker, py_name, None)
        if value is None:
            value = getattr(shortlist, py_name, None)
        if value is None:
            raise SystemExit(f"no encontre la lista {py_name}")
        lines.append(f"export const {ts_name}: string[] = {ts_value(list(value))};")

    lines += [
        "",
        f"export const SKILL_KEYWORDS: Record<string, string[]> = {skill_keywords_block()};",
        "",
        f"export const DEPTH_TO_WEIGHT: [string, number][] = {depth_to_weight_block()};",
        "",
        f"export const STACK_WEIGHT: Record<string, number> = {stack_weight_block()};",
        "",
    ]

    # El patron de anos de experiencia: la fuente es el propio Python.
    pattern = ranker.EXPERIENCE_RE.pattern
    flags = "gi" if ranker.EXPERIENCE_RE.flags & re.IGNORECASE else "g"
    lines += [
        "/** `EXPERIENCE_RE` del ranker, con el lookbehind que evita leer '100 Jahre' como '00'. */",
        f"export const EXPERIENCE_PATTERN = {json.dumps(pattern)};",
        f"export const EXPERIENCE_FLAGS = {json.dumps(flags)};",
        "",
        "/** Patron de `keyword_regex`: palabra completa, tolerando el plural final. */",
        "export const KEYWORD_TEMPLATE = '(?<![\\\\w]){keyword}s?(?![\\\\w])';",
        "",
    ]

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"escrito {out} ({out.stat().st_size} bytes)")
    print(f"skills: {len(shortlist.SKILL_KEYWORDS)} | listas: {len(LIST_CONSTANTS)} | numeros: {len(NUMBER_CONSTANTS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

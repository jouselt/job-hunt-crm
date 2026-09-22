#!/usr/bin/env python3
"""Rank LIVE job vacancies against the candidate profile.

Companion to shortlist_remote_companies.py. That tool ranks companies from a static
directory of profiles; this one ranks the vacancies the stepstone-search CLI pulls
from the JSON feeds (Remotive, RemoteOK, Arbeitnow).

The scoring core is shared on purpose: skill weights come from the profile's own
skill_depth through skill_weights(), so a company and a vacancy are measured with one
ruler and the two outputs cannot drift apart.

Disqualifiers are the profile's own and act as a hard gate. Unlike a company, a
vacancy can legitimately be rejected for saying "no sponsorship": that is a fact
about the posting, not about the employer.

Every rejection carries the evidence phrase that caused it, so the gate can be
audited instead of trusted.

Run:
    python3 tools/rank_live_vacancies.py --input '/tmp/vac/*.json'
"""

from __future__ import annotations

import argparse
import glob
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shortlist_remote_companies import (  # noqa: E402
    OTHER_STACK_LANGUAGES,
    PRIMARY_WEIGHT,
    SKILL_KEYWORDS,
    STACK_WEIGHT,
    keyword_regex,
    skill_weights,
)

DEFAULT_PROFILE = str(Path(__file__).resolve().parent.parent / "triage-profile.json")
DEFAULT_INPUT = "/tmp/vac/*.json"

# A vacancy is a posting, so the weighting differs from the company tool on purpose:
# where a company could be a long term target, a posting either is your stack in the
# title or it is noise, and it spoils if nobody applies.
TITLE_PRIMARY_BONUS = 7.0
TITLE_OTHER_BONUS = 3.0
TITLE_ROLE_BONUS = 6.0
TITLE_SENIOR_BONUS = 2.0
REMOTE_BONUS = 3.0
SPONSORSHIP_BONUS = 2.0
FRESH_DAYS = 30
FRESH_BONUS = 2.0

# Role words as job boards actually spell them, not as the profile writes them.
TITLE_ROLE_SIGNAL = [
    "fullstack",
    "full-stack",
    "full stack",
    "frontend",
    "front-end",
    "front end",
    "angular",
    "web developer",
    "software engineer",
    "software developer",
    "web engineer",
]

TS_JS_SIGNAL = [
    "typescript",
    "javascript",
    "angular",
    "node.js",
    "nodejs",
    "react",
    "vue",
    "nestjs",
    "rxjs",
    "js",
]

# A title commits to a stack, so an outsider language there is a rejection even when
# the body mentions TypeScript somewhere. "go" is deliberately absent: as a two-letter
# word it fires inside ordinary titles. Framework names are included because they
# imply the language.
OUTSIDER_TITLE = [token for token in OTHER_STACK_LANGUAGES if token != "go"] + [
    "golang",
    "rails",
    "laravel",
    "django",
    "spring",
    "symfony",
]

# The title has to name a role in the profile, otherwise the posting is a different
# job no matter how many technologies its body lists.
TITLE_ANY_SIGNAL = TITLE_ROLE_SIGNAL + [
    "developer",
    "engineer",
    "entwickler",
    "entwicklerin",
    "programmer",
]

# Body-level stack is capped. Without it an aggregator posting that lists fifteen
# technologies outranks a posting that IS an Angular job: the length of a
# requirements list is not fit. Title signals decide, the body only corroborates.
BODY_STACK_CAP = 12.0

MOBILE_PRIMARY = ["ios", "swift", "android", "kotlin", "flutter", "react native"]

WEB_STACK_IN_TITLE = [
    "angular",
    "typescript",
    "javascript",
    "node",
    "nestjs",
    "web",
    "frontend",
    "front-end",
    "fullstack",
    "full-stack",
    "full stack",
    "react",
]

MANAGEMENT_TITLE = [
    "engineering manager",
    "head of engineering",
    "head of development",
    "head of technology",
    "director of engineering",
    "engineering director",
    "team lead",
    "teamlead",
    "delivery manager",
    "cto",
]

BELOW_SENIOR_TITLE = [
    "junior",
    "jr",
    "trainee",
    "intern",
    "internship",
    "praktikum",
    "praktikant",
    "werkstudent",
    "working student",
    "student assistant",
    "dual student",
    "hilfskraft",
    "abschlussarbeit",
    "thesis student",
    "ausbildung",
    "berufseinsteiger",
    "einsteiger",
    "entry level",
    "entry-level",
    "graduate",
    "absolvent",
    "mid-level",
    "midlevel",
    "medior",
]

SENIOR_TITLE = ["senior", "sr", "lead", "principal", "staff"]

NO_SPONSORSHIP = [
    "no sponsorship",
    "no visa sponsorship",
    "no visa support",
    "not able to sponsor",
    "not able to offer sponsorship",
    "cannot sponsor",
    "can not sponsor",
    "unable to sponsor",
    "without sponsorship",
    "sponsorship is not available",
    "does not offer sponsorship",
    "kein visum",
    "keine visum",
    "visum wird nicht",
    "aufenthaltstitel erforderlich",
    "arbeitserlaubnis erforderlich",
    "existing work authorization",
    "existing work authorisation",
    "already have the right to work",
    "must be authorized to work",
    "must be authorised to work",
    "must already be eligible to work",
    "right to work in the eu",
    "eu work permit",
    "must be an eu citizen",
    "eu citizens only",
]

RESIDENCY_OR_CLEARANCE = [
    "security clearance",
    "sicherheitsuberprufung",
    "sicherheitsueberpruefung",
    "must be a resident",
    "must reside",
    "must be based in",
    "must be located in",
    "only candidates based in",
    "only considering candidates based in",
    "you must live in",
    "residents only",
    "already resident",
]

ONSITE_PRESENCE = [
    "on-site",
    "onsite",
    "on site",
    "vor ort",
    "prasenz",
    "praesenz",
    "office-based",
    "office based",
    "in-office",
    "hybrid",
]

RELOCATION_OFFERED = [
    "relocation",
    "relocation package",
    "relocation support",
    "umzug",
    "visa sponsorship",
    "sponsorship available",
    "we sponsor",
    "we do sponsor",
]

REMOTE_SIGNAL = [
    "remote",
    "fully remote",
    "100% remote",
    "home office",
    "homeoffice",
    "work from anywhere",
    "anywhere in the world",
    "remote-first",
]

# "3+ years", "2-4 years", "2 to 3 years", and their Spanish and German forms.
# The FLOOR decides: a posting open to someone with under 4 years is pitched below
# senior, whatever its ceiling says. A senior title buys one year of tolerance,
# because "Senior X, 3+ years" is the DACH norm rather than a mislabelled mid-level
# role.
#
# The Spanish forms are not decoration. The Chilean feed is written in Spanish, and
# without `anos`/`años` the years rule could never fire on it: "Buscamos 3 años de
# experiencia" read as no ask at all, so a mid-level posting passed the seniority
# gate silently. A gate that cannot fire on half the corpus is not a gate.
#
# The trailing `\b` stops the Spanish form from matching inside a longer word. The
# leading `(?<!\d)` stops "100 Jahre Firmengeschichte" (a company anniversary) from
# reading as "00 years of experience".
EXPERIENCE_RE = re.compile(
    r"(?<!\d)(\d{1,2})\s*(?:\+|(?:-|\s+to\s+)\s*(\d{1,2}))?\s*(?:jahre|years|anos|años)\b",
    re.IGNORECASE,
)
DEFAULT_YEARS_FLOOR = 4
SENIOR_TITLE_YEARS_FLOOR = 3

# Requirements live in "you must have" lists, wishes live in "nice to have" ones.
# Tripping on a wish would reject a job the candidate is right for, which costs more
# than letting a mid-level posting through the gate.
YEARS_SOFT_CUES = [
    "plus",
    "nice to have",
    "nice-to-have",
    "ideal",
    "preferred",
    "bonus",
    "von vorteil",
    "wunschenswert",
    "wünschenswert",
    "optional",
]


@dataclass
class Vacancy:
    source: str
    id: str
    title: str
    company: str | None
    location: str | None
    date: str | None
    url: str
    description: str = ""
    salary: str | None = None
    text: str = field(default="", repr=False)

    def __post_init__(self) -> None:
        if not self.text:
            self.text = " ".join(
                part
                for part in (self.title, self.company, self.location, self.description)
                if part
            ).lower()


def load_vacancies(paths: list[str]) -> list[Vacancy]:
    """Read the CLI's JSON output. `meta` is ignored on purpose: it describes the
    fetch, not the jobs, and re-deriving counts from it would double-report."""
    vacancies: list[Vacancy] = []
    for path in paths:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        source = (payload.get("meta") or {}).get("source") or Path(path).stem
        for raw in payload.get("results") or []:
            title = (raw.get("title") or "").strip()
            url = (raw.get("url") or "").strip()
            if not title or not url:
                continue
            vacancies.append(
                Vacancy(
                    source=source,
                    id=str(raw.get("id") or url),
                    title=title,
                    company=(raw.get("company") or None),
                    location=(raw.get("location") or None),
                    date=(raw.get("date") or None),
                    url=url,
                    description=raw.get("description") or "",
                    salary=(raw.get("salary") or None),
                )
            )
    return vacancies


def dedupe(vacancies: list[Vacancy]) -> tuple[list[Vacancy], int]:
    """Drop the same posting seen twice.

    Two keys, not one: `url` catches the identical link, and `title + company`
    catches the same job cross-posted to a second board under a different link.

    When the same posting arrives twice, the copy with more evidence wins. The
    API index carries no description and the enriched copy of the same pega does,
    so without this the surviving copy would depend on the order the glob
    happened to return the files in.
    """
    by_key: dict[str, int] = {}
    kept: list[Vacancy] = []
    duplicates = 0
    for vacancy in vacancies:
        keys = [
            vacancy.url.lower().rstrip("/"),
            f"{(vacancy.title or '').lower()}|{(vacancy.company or '').lower()}",
        ]
        existing = next((by_key[key] for key in keys if key in by_key), None)
        if existing is None:
            kept.append(vacancy)
            for key in keys:
                by_key[key] = len(kept) - 1
            continue
        duplicates += 1
        if len(vacancy.description or "") > len(kept[existing].description or ""):
            kept[existing] = vacancy
    return kept, duplicates


def _hits(patterns: list[str], text: str) -> list[str]:
    """Which patterns appear, word-bounded, so `intern` never fires in `internal`."""
    return [p for p in patterns if keyword_regex(p).search(text)]


def match_skills(vacancy: Vacancy, weights: dict[str, float]) -> list[str]:
    """Profile skills named anywhere in the posting."""
    if not vacancy.text:
        return []
    hits = []
    for skill, weight in weights.items():
        if weight <= 0:
            continue
        if any(keyword_regex(k).search(vacancy.text) for k in SKILL_KEYWORDS.get(skill, [])):
            hits.append(skill)
    return sorted(hits, key=lambda s: (-weights[s], s))


def title_skills(vacancy: Vacancy, weights: dict[str, float]) -> list[str]:
    """Profile skills named in the TITLE, which is where a posting commits."""
    title = vacancy.title.lower()
    return sorted(
        (
            skill
            for skill in weights
            if any(keyword_regex(k).search(title) for k in SKILL_KEYWORDS.get(skill, []))
        ),
        key=lambda s: (-weights[s], s),
    )


def disqualified(vacancy: Vacancy) -> list[str]:
    """The profile's seven disqualifiers, each returning the phrase that tripped it.

    Returning evidence rather than a boolean is deliberate: a gate nobody can audit
    is a gate nobody can trust, and a false rejection here costs a real application.
    """
    reasons: list[str] = []
    title = vacancy.title.lower()
    text = vacancy.text

    # 6. Primary stack outside the profile. The body is judged leniently (one mention
    # of TS/JS clears it), but the TITLE is judged strictly: a posting titled
    # ".NET Full-stack Developer" is not this candidate's job even if its body name
    # drops TypeScript. Body and title are separate tests for that reason.
    title_outsiders = sorted({token for token in OUTSIDER_TITLE if keyword_regex(token).search(title)})
    if title_outsiders and not _hits(TS_JS_SIGNAL, title):
        reasons.append(f"title names a stack outside the profile: {', '.join(title_outsiders)}")

    outsiders = sorted(
        {token for token in OTHER_STACK_LANGUAGES if keyword_regex(token).search(text)}
    )
    if outsiders and not _hits(TS_JS_SIGNAL, text):
        reasons.append(f"stack outside the profile with no TS/JS: {', '.join(outsiders)}")

    # 5. Native mobile as the primary stack.
    mobile = _hits(MOBILE_PRIMARY, title)
    if mobile and not _hits(WEB_STACK_IN_TITLE, title):
        reasons.append(f"native mobile primary in the title: {', '.join(mobile)}")

    # 4. Pure people management, with no hands-on stack in the title.
    management = _hits(MANAGEMENT_TITLE, title)
    if management and not _hits(WEB_STACK_IN_TITLE, title):
        reasons.append(f"people management as the primary function: {', '.join(management)}")

    # 1. Seniority below senior: level words in the title, then the years ask.
    senior_titled = bool(_hits(SENIOR_TITLE, title))
    if not senior_titled:
        below = _hits(BELOW_SENIOR_TITLE, title)
        if below:
            reasons.append(f"below senior in the title: {', '.join(below)}")

    # The years ask speaks even under a senior title, one year more lenient there.
    floor = SENIOR_TITLE_YEARS_FLOOR if senior_titled else DEFAULT_YEARS_FLOOR
    for match in EXPERIENCE_RE.finditer(text):
        window = text[max(0, match.start() - 60) : match.start()]
        if any(cue in window for cue in YEARS_SOFT_CUES):
            continue
        numbers = [int(group) for group in match.groups() if group is not None]
        if numbers and min(numbers) < floor:
            reasons.append(f"asks {match.group(0).strip()} of experience")
            break

    # 3. Requires existing EU/EFTA authorization or states no sponsorship.
    no_sponsor = _hits(NO_SPONSORSHIP, text)
    if no_sponsor:
        reasons.append(f"no sponsorship offered: {', '.join(no_sponsor[:3])}")

    # 7. Clearance, or restricted to candidates already resident.
    restricted = _hits(RESIDENCY_OR_CLEARANCE, text)
    if restricted:
        reasons.append(f"residency or clearance restriction: {', '.join(restricted[:3])}")

    # 2. Presence in another country with no relocation and no visa path. Only fires
    # when all three hold: presence asked, no remote offered, nothing about relocating.
    presence = _hits(ONSITE_PRESENCE, text)
    if presence and not _hits(REMOTE_SIGNAL, text) and not _hits(RELOCATION_OFFERED, text):
        reasons.append(f"on-site presence in another country with no relocation: {presence[0]}")

    return reasons


def score_vacancy(
    vacancy: Vacancy, weights: dict[str, float], today: date
) -> tuple[float, list[str], list[str], list[str]]:
    """Return (score, matched skills, title skills, positive signals)."""
    matched = match_skills(vacancy, weights)
    in_title = title_skills(vacancy, weights)
    title = vacancy.title.lower()
    title_set = set(in_title)

    # The body corroborates, the title decides.
    body_stack = sum(weights[skill] for skill in matched if skill not in title_set)
    score = min(body_stack, BODY_STACK_CAP)
    score += sum(
        TITLE_PRIMARY_BONUS if weights[s] >= PRIMARY_WEIGHT else TITLE_OTHER_BONUS
        for s in in_title
    )

    signals: list[str] = []

    if _hits(TITLE_ROLE_SIGNAL, title):
        score += TITLE_ROLE_BONUS
        signals.append("role in title")
    if _hits(SENIOR_TITLE, title):
        score += TITLE_SENIOR_BONUS
        signals.append("senior in title")
    if _hits(REMOTE_SIGNAL, vacancy.text):
        score += REMOTE_BONUS
        signals.append("remote")
    if _hits(RELOCATION_OFFERED, vacancy.text):
        score += SPONSORSHIP_BONUS
        signals.append("relocation or sponsorship offered")
    days = days_old(vacancy.date, today)
    if days is not None and days <= FRESH_DAYS:
        score += FRESH_BONUS
        signals.append("posted recently")

    return score, matched, in_title, signals


def days_old(value: str | None, today: date) -> int | None:
    if not value:
        return None
    try:
        posted = date.fromisoformat(value[:10])
    except ValueError:
        return None
    return (today - posted).days


def build_ranking(
    vacancies: list[Vacancy], profile: dict, today: date
) -> tuple[list[dict], list[dict], dict]:
    weights = skill_weights(profile)
    funnel = {
        "loaded": len(vacancies),
        "disqualified": 0,
        "no_profile_skill": 0,
        "no_primary_skill": 0,
        "no_title_signal": 0,
        "candidates": 0,
        "with_primary_stack": 0,
        "senior_titled": 0,
    }
    rejected: list[dict] = []
    rows: list[dict] = []

    for vacancy in vacancies:
        reasons = disqualified(vacancy)
        if reasons:
            funnel["disqualified"] += 1
            rejected.append(
                {"title": vacancy.title, "company": vacancy.company, "url": vacancy.url,
                 "source": vacancy.source, "reasons": reasons}
            )
            continue

        score, matched, in_title, signals = score_vacancy(vacancy, weights, today)
        if not matched:
            funnel["no_profile_skill"] += 1
            continue

        # Same gate the company tool uses: the posting has to name at least one skill
        # from the profile's daily stack. "Senior Embedded Linux Engineer" matched on
        # Docker, Jenkins and Python and was landing in the list off that alone.
        primary = sum(1 for skill in matched if weights[skill] >= PRIMARY_WEIGHT)
        if primary == 0:
            funnel["no_primary_skill"] += 1
            rejected.append(
                {
                    "title": vacancy.title,
                    "company": vacancy.company,
                    "url": vacancy.url,
                    "source": vacancy.source,
                    "reasons": [
                        "no skill from the profile's daily stack: "
                        + ", ".join(matched[:4])
                    ],
                }
            )
            continue

        # A posting whose title names neither a profile skill nor a profile role is a
        # different job: no body text can make it this candidate's role. Aggregators
        # list every technology they place, which is exactly why the title decides.
        if not in_title and not _hits(TITLE_ANY_SIGNAL, vacancy.title.lower()):
            funnel["no_title_signal"] += 1
            continue

        funnel["candidates"] += 1
        rows.append(
            {
                "title": vacancy.title,
                "company": vacancy.company,
                "location": vacancy.location,
                "source": vacancy.source,
                "date": vacancy.date,
                "days_old": days_old(vacancy.date, today),
                "url": vacancy.url,
                "score": round(score, 1),
                "matched_skills": matched,
                "primary_matches": sum(
                    1 for skill in matched if weights[skill] >= PRIMARY_WEIGHT
                ),
                "title_skills": in_title,
                "signals": signals,
                "salary": vacancy.salary,
            }
        )

    # Body stack is capped, so many postings land on the same score. Breaking those
    # ties by how many DAILY-stack skills the posting names is meaningful; breaking
    # them alphabetically was not.
    rows.sort(
        key=lambda row: (-row["score"], -row["primary_matches"], row["title"].lower(), row["url"])
    )
    funnel["with_primary_stack"] = sum(
        1 for row in rows if any(weights[s] >= PRIMARY_WEIGHT for s in row["matched_skills"])
    )
    funnel["senior_titled"] = sum(
        1 for row in rows if _hits(SENIOR_TITLE, row["title"].lower())
    )
    return rows, rejected, funnel


def md_cell(value: object) -> str:
    """Texto seguro para una celda de tabla.

    Un `|` dentro de un titulo parte la fila y rompe la tabla entera, y un salto
    de linea la corta. Los avisos reales traen los dos: "Desarrollador/a
    Fullstack | React.js + NestJS/Node.js" es un titulo de getonbrd.
    """
    return " ".join(str(value if value is not None else "").split()).replace("|", "\\|")


def md_url(url: str) -> str:
    """En un destino de link el `|` no se escapa con barra: va codificado."""
    return (url or "").replace("|", "%7C").replace(" ", "%20")


def render_markdown(
    rows: list[dict],
    rejected: list[dict],
    funnel: dict,
    today: date,
    detail_rows: list[dict] | None = None,
) -> str:
    """The table is always the complete candidate list; the detail is capped."""
    detail_rows = rows if detail_rows is None else detail_rows
    lines = [
        "# Live vacancies, ranked against the profile",
        "",
        f"- Generated: {today.isoformat()}",
        f"- Sources: {', '.join(sorted({row['source'] for row in rows})) or 'none'}",
        "- Ranking core shared with the company shortlist: skill weights come from the",
        "  profile's own `skill_depth`, so the two outputs cannot drift apart.",
        "",
        "## Funnel",
        "",
        f"- Vacancies loaded: {funnel['loaded']}",
        f"- Removed as duplicates: {funnel['duplicates']}",
        f"- Disqualified by the profile gate: {funnel['disqualified']}",
        f"- No profile skill anywhere: {funnel['no_profile_skill']}",
        f"- No skill from the daily stack: {funnel['no_primary_skill']}",
        f"- Title names no profile skill and no profile role: {funnel['no_title_signal']}",
        f"- Remaining candidates: {funnel['candidates']}",
        f"- Matching the daily stack: {funnel['with_primary_stack']}",
        f"- With a senior title: {funnel['senior_titled']}",
        "",
        "## How the score works",
        "",
        f"- Stack: the profile skill weights, as in the company tool",
        f"- Body stack is capped at {BODY_STACK_CAP:.0f} points, so a posting that lists "
        "every technology it places cannot outrank one that IS the job.",
        f"- In the title: +{TITLE_PRIMARY_BONUS:.0f} for a daily-stack skill, "
        f"+{TITLE_OTHER_BONUS:.0f} for any other profile skill.",
        f"- Role word in the title: +{TITLE_ROLE_BONUS:.0f}. "
        f"Senior in the title: +{TITLE_SENIOR_BONUS:.0f}.",
        f"- Remote: +{REMOTE_BONUS:.0f}. Relocation or sponsorship offered: "
        f"+{SPONSORSHIP_BONUS:.0f}. Posted in the last {FRESH_DAYS} days: +{FRESH_BONUS:.0f}.",
        "",
        "## Candidates",
        "",
        "| # | Score | Title | Company | Source | Posted | Salary | Skills in title | Apply |",
        "|---|-------|-------|---------|--------|--------|--------|-----------------|-------|",
    ]

    for index, row in enumerate(rows, start=1):
        company = md_cell(row["company"] or "-")
        in_title = md_cell(", ".join(row["title_skills"][:3]) or "-")
        posted = row["date"] or "-"
        if row["days_old"] is not None:
            posted += f" ({row['days_old']}d)"
        lines.append(
            f"| {index} | {row['score']} | {md_cell(row['title'])} | {company} | "
            f"{md_cell(row['source'])} | {posted} | {md_cell(row['salary'] or '-')} | "
            f"{in_title} | [open]({md_url(row['url'])}) |"
        )

    lines += ["", f"## Detail (top {len(detail_rows)})", ""]
    for index, row in enumerate(detail_rows, start=1):
        lines.append(f"### {index}. {md_cell(row['title'])} - {md_cell(row['company'] or 'unknown company')}")
        lines.append("")
        lines.append(f"- Score: {row['score']}")
        lines.append(f"- Apply: {row['url']}")
        lines.append(f"- Location: {row['location'] or 'unspecified'} | Source: {row['source']}")
        if row.get("salary"):
            lines.append(f"- Salary: {row['salary']}")
        lines.append(
            f"- Posted: {row['date'] or 'unknown'}"
            + (f" ({row['days_old']} days ago)" if row["days_old"] is not None else "")
        )
        lines.append(f"- Skills found: {', '.join(row['matched_skills']) or 'none'}")
        if row["title_skills"]:
            lines.append(f"- Skills in the title: {', '.join(row['title_skills'])}")
        if row["signals"]:
            lines.append(f"- Signals: {', '.join(row['signals'])}")
        lines.append("")

    if rejected:
        lines += ["## Rejected, with the phrase that did it", ""]
        reasons: dict[str, int] = {}
        for row in rejected:
            for reason in row["reasons"]:
                key = reason.split(":")[0]
                reasons[key] = reasons.get(key, 0) + 1
        for key, count in sorted(reasons.items(), key=lambda pair: -pair[1]):
            lines.append(f"- {key}: {count}")
        lines.append("")
        lines.append("A sample, so the gate can be spot checked:")
        lines.append("")
        for row in rejected[:15]:
            lines.append(f"- {md_cell(row['title'])} ({md_cell(row['company'] or '?')}) -> {'; '.join(row['reasons'])}")
        lines.append("")

    lines += [
        "## Source",
        "",
        "Two fetchers, both writing the same JSON shape:",
        "",
        "```",
        "bun run src/cli.ts search --source arbeitnow --pages 6 --desc-chars 4000 --format json",
        "python3 tools/fetch_pegas_devschile.py --query angular,nestjs --enrich",
        "```",
        "",
        "`pegas-devschile` comes from the public API of the devsChile job board",
        "(github.com/devschile/pegas). Its index carries no description, so `--enrich`",
        "follows each posting's url to the original source; a row that could not be",
        "enriched is decided on its title alone.",
        "",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=DEFAULT_INPUT, help="glob of CLI JSON outputs")
    parser.add_argument("--profile", default=DEFAULT_PROFILE)
    parser.add_argument("--out-dir", default=str(Path(__file__).resolve().parent.parent / "out"))
    parser.add_argument("--top", type=int, default=40)
    parser.add_argument("--today", default=None)
    args = parser.parse_args()

    paths = sorted(glob.glob(args.input))
    if not paths:
        print(f"no input matched {args.input}", file=sys.stderr)
        return 1

    vacancies = load_vacancies(paths)
    kept, duplicates = dedupe(vacancies)
    profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))
    today = date.fromisoformat(args.today) if args.today else date.today()

    rows, rejected, funnel = build_ranking(kept, profile, today)
    funnel["duplicates"] = duplicates

    shown = rows[: args.top] if args.top else rows
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "live-vacancies.md").write_text(
        render_markdown(rows, rejected, funnel, today, detail_rows=shown), encoding="utf-8"
    )
    (out_dir / "live-vacancies.json").write_text(
        json.dumps(
            {"generated": today.isoformat(), "funnel": funnel, "rows": rows, "rejected": rejected},
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print(json.dumps(funnel, indent=2))
    print(f"\ncandidates: {len(rows)} (report shows {len(shown)}), rejected: {len(rejected)}")
    print(f"wrote {out_dir / 'live-vacancies.md'}")
    print(f"wrote {out_dir / 'live-vacancies.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Rank remote-friendly companies from the remote-jobs directory against a candidate profile.

Why the prose and not the frontmatter tags: in the remote-jobs corpus only 1 company
is tagged `angular` and 2 are tagged `typescript`, while the "Company technologies"
prose section names Angular for 79 companies and TypeScript for 145. The tags are a
coarse catch-all (636 companies are tagged `javascript`), so matching on them alone
throws away almost all of the signal. This tool reads the prose section as the primary
signal and keeps the tags only for the disqualifying-stack caution.

Usage:
    python3 shortlist_remote_companies.py \
        --profile /path/to/triage-profile.json \
        --companies-dir /path/to/remote-jobs/src/companies \
        --out-dir /path/to/career-prep

Writes `shortlist-remote-companies.md` (human) and `shortlist-remote-companies.json`
(machine readable, for the CRM and for the triage pipeline).
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------
# rubric
# ---------------------------------------------------------------------------

# Regions that matter for this profile, in order of preference. The profile's
# target markets are remote-first international, DACH/Northern Europe, Nordics
# and Australia/NZ, so `asia-pacific` is kept (Australia/NZ) and `americas` is
# dropped as a hard gate: it is US-centric and the profile needs sponsorship.
REGION_SCORE = {
    "europe": 6.0,
    "americas-europe": 5.0,
    "worldwide": 4.0,
    "asia-pacific": 2.0,
}

REMOTE_SCORE = {
    "fully-remote": 6.0,
    "remote-first": 5.0,
    "remote-friendly": 3.0,
    "hybrid": 1.0,
}

# Stack weights come from the profile's own skill_depth, so the ranking follows
# the candidate's stated depth rather than a guess about what "sounds senior".
STACK_WEIGHT = {"primary_daily": 5.0, "production": 3.0, "transferable": 1.0, "personal": 1.0}

# The corpus is old: the median shortlist profile was last touched 47 months ago and
# 22 of 162 carry no date at all. Flagging staleness would mark 84% of the list and
# discriminate nothing, so the marker is inverted into the rare, useful case: a
# profile verified recently. It earns a small bonus, the only place age enters the
# ranking.
FRESH_MONTHS = 24
FRESH_BONUS = 2.0

# A row has to match at least one skill at this weight to be a shortlist candidate.
# Without it a company that only says "Docker" or "Python" would qualify, and the
# list stops being a shortlist: it is the profile's daily stack or it is noise.
PRIMARY_WEIGHT = STACK_WEIGHT["primary_daily"]

# Profile skill -> the strings that actually appear in the corpus prose.
# Tokens are matched with word boundaries so `go` cannot fire inside `google`.
SKILL_KEYWORDS: dict[str, list[str]] = {
    "Angular": ["angular"],
    "AngularJS": ["angularjs", "angular.js"],
    "TypeScript": ["typescript"],
    "NestJS": ["nestjs", "nest.js"],
    "Node.js": ["node.js", "nodejs"],
    "RxJS": ["rxjs"],
    "NgRx": ["ngrx"],
    "Stencil.js": ["stencil"],
    "Web Components": ["web component"],
    "Microfrontends": ["microfrontend", "micro-frontend"],
    "single-spa": ["single-spa"],
    "PrimeNG": ["primeng"],
    "Angular Material": ["angular material"],
    "REST APIs": ["rest api", "restful"],
    "BFF architecture": ["bff"],
    "WebSockets": ["websocket"],
    "PostgreSQL": ["postgres", "postgresql"],
    "TypeORM": ["typeorm"],
    "Docker": ["docker"],
    "Jest": ["jest"],
    "Karma": ["karma"],
    "Jasmine": ["jasmine"],
    "AWS": ["aws", "amazon web services"],
    "Ionic": ["ionic"],
    "Jenkins": ["jenkins"],
    "GitLab CI/CD": ["gitlab"],
    "Azure DevOps": ["azure devops"],
    "Splunk": ["splunk"],
    "Accessibility (a11y)": ["accessibility", "a11y"],
    "i18n": ["i18n", "internationalization"],
    "React": ["react"],
    ".NET backend API integration": [".net", "dotnet"],
    "Python": ["python"],
}

# Profile skill -> slug used by the profile's skill_depth block.
DEPTH_TO_WEIGHT = [
    ("primary_daily", STACK_WEIGHT["primary_daily"]),
    ("production_experience", STACK_WEIGHT["production"]),
    ("personal_projects", STACK_WEIGHT["personal"]),
    ("transferable_not_primary", STACK_WEIGHT["transferable"]),
]

# Languages outside this profile, as they appear in the corpus prose. Reported as
# context, never as a filter: the shortlist gate already guarantees the daily stack,
# so stamping a company "disqualifying" over a language list would be theatre. Both
# spellings are kept because the tags and the prose disagree on them (90 companies
# carry the `dotnet` tag while their prose says ".NET").
OTHER_STACK_LANGUAGES = [
    "java",
    "c#",
    "csharp",
    ".net",
    "dotnet",
    "php",
    "golang",
    "go",
    "rust",
    "ruby",
    "scala",
    "elixir",
    "kotlin",
    "swift",
    "perl",
]

SECTION_TECHNOLOGIES = "Company technologies"
SECTION_REGION = "Region"


# ---------------------------------------------------------------------------
# parsing
# ---------------------------------------------------------------------------

FRONTMATTER = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?(.*)\Z", re.S)
LIST_ITEM = re.compile(r"^\s*-\s+(.*)$")


@dataclass
class Company:
    slug: str
    title: str
    website: str | None
    careers_url: str | None
    region: str | None
    remote_policy: str | None
    company_size: str | None
    technologies: list[str] = field(default_factory=list)
    updated_at: str | None = None
    technologies_section: str = ""
    region_section: str = ""
    profile_path: str = ""

    @property
    def file_name(self) -> str:
        """The profile's filename, which does not always match the frontmatter slug.

        45 of the 884 profiles in the corpus have a slug that disagrees with their
        filename, so a slug on its own will not open the profile.
        """
        return self.profile_path.rsplit("/", 1)[-1]

    @property
    def prose(self) -> str:
        """The technology section, lowercased.

        The frontmatter tags are deliberately excluded. They are coarse (636 of the
        884 profiles carry the single `javascript` tag while exactly 1 carries
        `angular`) and matching against them produces claims the prose cannot back.
        """
        return self.technologies_section.lower()


def parse_frontmatter(text: str) -> tuple[dict[str, str], list[str], str] | None:
    """Return (scalars, technologies list, body) or None when there is no frontmatter."""
    match = FRONTMATTER.match(text)
    if not match:
        return None
    raw, body = match.group(1), match.group(2)

    scalars: dict[str, str] = {}
    technologies: list[str] = []
    in_technologies = False

    for line in raw.splitlines():
        if in_technologies:
            item = LIST_ITEM.match(line)
            if item:
                technologies.append(item.group(1).strip().strip('"').strip("'"))
                continue
            if line.strip():
                in_technologies = False
        if line.startswith("technologies:"):
            in_technologies = True
            continue
        if ":" not in line or line.lstrip().startswith("-"):
            continue
        key, value = line.split(":", 1)
        scalars[key.strip()] = value.strip().strip('"').strip("'")

    return scalars, technologies, body


def extract_section(body: str, heading: str) -> str:
    """Text of `## <heading>` up to the next h2. Empty string when absent."""
    start = re.search(r"^##\s+" + re.escape(heading) + r"\s*$", body, re.M)
    if not start:
        return ""
    rest = body[start.end():]
    nxt = re.search(r"^##\s+", rest, re.M)
    return (rest[: nxt.start()] if nxt else rest).strip()


def load_company(path: Path) -> Company | None:
    parsed = parse_frontmatter(path.read_text(encoding="utf-8"))
    if parsed is None:
        return None
    scalars, technologies, body = parsed
    return Company(
        slug=scalars.get("slug", path.stem),
        title=scalars.get("title", path.stem),
        website=scalars.get("website") or None,
        careers_url=scalars.get("careers_url") or None,
        region=scalars.get("region") or None,
        remote_policy=scalars.get("remote_policy") or None,
        company_size=scalars.get("company_size") or None,
        technologies=technologies,
        updated_at=scalars.get("updatedAt") or None,
        technologies_section=extract_section(body, SECTION_TECHNOLOGIES),
        region_section=extract_section(body, SECTION_REGION),
        profile_path=str(path),
    )


# ---------------------------------------------------------------------------
# matching
# ---------------------------------------------------------------------------

def entry_tokens(entry: str) -> list[str]:
    """Split a skill_depth entry into comparable tokens.

    Entries are free text written by hand: "Angular 18 (Disney Parks)",
    "Stencil.js / Web Components", "React (production use 2021-2022)".
    Splitting on "/" and "," keeps a multi-skill entry from losing its weight.
    """
    base = re.split(r"\s*\(", entry)[0]
    return [token.strip() for token in re.split(r"[/,]", base) if token.strip()]


def skill_matches_token(skill: str, token: str) -> bool:
    """A token denotes this skill on a word-boundary match, never on a substring.

    Substring matching lets the high-weight "Angular" bleed onto the separate
    "AngularJS" skill, which carries its own, lower, depth. Both directions use
    word boundaries so token "Node" still reaches skill "Node.js".
    """
    skill_lower, token_lower = skill.lower(), token.lower()
    forward = re.search(r"(?<![\w])" + re.escape(skill_lower) + r"(?![\w])", token_lower)
    backward = re.search(r"(?<![\w])" + re.escape(token_lower) + r"(?![\w])", skill_lower)
    return bool(forward or backward)


def skill_weights(profile: dict) -> dict[str, float]:
    """Map every profile skill to a weight taken from the profile's own skill_depth."""
    depth = profile.get("skill_depth", {}) or {}
    weights: dict[str, float] = {}

    for depth_key, weight in DEPTH_TO_WEIGHT:
        for entry in depth.get(depth_key, []) or []:
            for token in entry_tokens(entry):
                for skill in SKILL_KEYWORDS:
                    if skill_matches_token(skill, token):
                        weights[skill] = max(weights.get(skill, 0.0), weight)

    # Anything in `skills` that skill_depth did not classify still counts, at the
    # transferable weight, so the ranking never silently drops a listed skill.
    for skill in profile.get("skills", []) or []:
        if skill in SKILL_KEYWORDS and skill not in weights:
            weights[skill] = STACK_WEIGHT["transferable"]

    return weights


def keyword_regex(keyword: str) -> re.Pattern[str]:
    """Word-bounded keyword, tolerating a trailing plural `s`.

    The corpus prose writes both "WebSocket" and "WebSockets", "Microfrontend" and
    "Microfrontends". Anchoring on the singular alone silently drops matches, which
    is a miss the report cannot show you.
    """
    return re.compile(r"(?<![\w])" + re.escape(keyword) + r"s?(?![\w])")


def match_skills(company: Company, weights: dict[str, float]) -> list[str]:
    """Profile skills named in the company's technology prose."""
    text = company.prose
    if not text:
        return []
    hits = []
    for skill, weight in weights.items():
        if weight <= 0:
            continue
        for keyword in SKILL_KEYWORDS.get(skill, []):
            if keyword_regex(keyword).search(text):
                hits.append(skill)
                break
    return sorted(hits, key=lambda s: (-weights[s], s))


def other_languages(company: Company) -> list[str]:
    """Languages outside the profile that the technology prose names, if any.

    Reads the prose on purpose. The frontmatter tags are a coarse catch-all (636 of
    884 companies are tagged `javascript`), so consulting them here would describe
    nearly every company identically.
    """
    text = company.prose
    if not text:
        return []
    return sorted(
        {token for token in OTHER_STACK_LANGUAGES if keyword_regex(token).search(text)}
    )


def months_since(value: str | None, today: date) -> int | None:
    if not value:
        return None
    try:
        then = date.fromisoformat(value[:10])
    except ValueError:
        return None
    return (today.year - then.year) * 12 + (today.month - then.month)


def score_company(
    company: Company, weights: dict[str, float], today: date
) -> tuple[float, list[str], int | None, list[str]]:
    """Return (score, matched skills, months since update, other languages)."""
    matched = match_skills(company, weights)
    stack = sum(weights[skill] for skill in matched)
    region = REGION_SCORE.get(company.region or "", 0.0)
    remote = REMOTE_SCORE.get(company.remote_policy or "", 0.0)

    age = months_since(company.updated_at, today)
    bonus = FRESH_BONUS if age is not None and age <= FRESH_MONTHS else 0.0

    return stack + region + remote + bonus, matched, age, other_languages(company)


def build_shortlist(
    companies: list[Company], profile: dict, today: date
) -> tuple[list[dict], dict]:
    """Apply the gates, score the survivors, return (rows, funnel counts)."""
    weights = skill_weights(profile)
    funnel = {
        "parsed": len(companies),
        "with_careers_url": 0,
        "region_relevant": 0,
        "stack_match": 0,
        "primary_stack": 0,
        "pure_profile_stack": 0,
    }

    rows = []
    for company in companies:
        if not company.careers_url:
            continue
        funnel["with_careers_url"] += 1
        if (company.region or "") not in REGION_SCORE:
            continue
        funnel["region_relevant"] += 1

        score, matched, age, others = score_company(company, weights, today)
        if not matched:
            continue
        funnel["stack_match"] += 1

        if not any(weights[skill] >= PRIMARY_WEIGHT for skill in matched):
            continue
        funnel["primary_stack"] += 1

        rows.append(
            {
                "name": company.title,
                "slug": company.slug,
                "score": round(score, 1),
                "matched_skills": matched,
                "region": company.region,
                "remote_policy": company.remote_policy,
                "company_size": company.company_size,
                "careers_url": company.careers_url,
                "website": company.website,
                "updated_at": company.updated_at,
                "months_since_update": age,
                "fresh_profile": age is not None and age <= FRESH_MONTHS,
                "other_languages": others,
                "file": company.file_name,
                "profile_path": company.profile_path,
                "tags": company.technologies,
            }
        )

    rows.sort(key=lambda row: (-row["score"], row["name"]))
    funnel["pure_profile_stack"] = sum(1 for row in rows if not row["other_languages"])
    return rows, funnel


# ---------------------------------------------------------------------------
# rendering
# ---------------------------------------------------------------------------

def render_markdown(
    rows: list[dict],
    funnel: dict,
    profile: dict,
    today: date,
    detail_rows: list[dict] | None = None,
) -> str:
    """Render the report. The table is always complete; the detail section is capped."""
    detail_rows = rows if detail_rows is None else detail_rows
    lines = [
        "# Remote company shortlist",
        "",
        f"Generated {today.isoformat()} from the `remote-jobs` directory, ranked against "
        "`triage-profile.json`.",
        "",
        "## Funnel",
        "",
        f"- Companies parsed: {funnel['parsed']}",
        f"- With a `careers_url` (hard gate): {funnel['with_careers_url']}",
        f"- Region relevant to the target markets: {funnel['region_relevant']}",
        f"- Mentions any profile skill: {funnel['stack_match']}",
        f"- Matches the daily stack, so it is a candidate: {funnel['primary_stack']}",
        f"- Pure profile stack, no other language named: {funnel['pure_profile_stack']}",
        "",
        f"Table lists all {len(rows)} candidates. Detail covers the top {len(detail_rows)}. "
        "Machine-readable rows are in `shortlist-remote-companies.json`.",
        "",
        "## How the ranking works",
        "",
        "- Gate: the technology section has to name at least one skill from the profile's ",
        "  primary daily stack (Angular, TypeScript, RxJS, Node.js, NestJS). Without it a ",
        "  company that only says Docker or Python would qualify and the list stops being a shortlist.",
        "- Stack score: the sum of the weights of the profile skills named in the company's ",
        "  technology section (primary daily 5, production 3, transferable 1).",
        "- Region: europe 6, americas-europe 5, worldwide 4, asia-pacific 2.",
        "- Remote policy: fully-remote 6, remote-first 5, remote-friendly 3, hybrid 1.",
        f"- Profile verified within {FRESH_MONTHS} months: {FRESH_BONUS} points and a `fresh` ",
        "  marker. The marker is inverted on purpose: the corpus median is 47 months old, ",
        "  so flagging staleness would tag 84% of the list and tell you nothing.",
        "",
        "The signal comes from the `Company technologies` prose, not the frontmatter tags: ",
        "in this corpus only 1 company is tagged `angular` while 79 name Angular in prose.",
        "",
        "## Shortlist",
        "",
        "| # | Company | Score | Region | Remote | Matched | Careers |",
        "|---|---------|-------|--------|--------|---------|---------|",
    ]

    for index, row in enumerate(rows, start=1):
        flags = []
        if row["fresh_profile"]:
            flags.append("fresh")
        name = row["name"] + (f" ({', '.join(flags)})" if flags else "")
        matched = ", ".join(row["matched_skills"][:4])
        if len(row["matched_skills"]) > 4:
            matched += f" +{len(row['matched_skills']) - 4}"
        lines.append(
            f"| {index} | {name} | {row['score']} | {row['region']} | "
            f"{row['remote_policy']} | {matched} | [apply]({row['careers_url']}) |"
        )

    lines += ["", f"## Detail (top {len(detail_rows)})", ""]
    for index, row in enumerate(detail_rows, start=1):
        lines.append(f"### {index}. {row['name']}")
        lines.append("")
        lines.append(f"- Careers: {row['careers_url']}")
        if row["website"]:
            lines.append(f"- Website: {row['website']}")
        lines.append(f"- Region: {row['region']} | Remote: {row['remote_policy']} | Size: {row['company_size']}")
        age = row["months_since_update"]
        lines.append(
            f"- Profile: `src/companies/{row['file']}` | last updated "
            f"{row['updated_at'] or 'unknown'}"
            + (f" ({age} months ago)" if age is not None else " (no date in the profile)")
        )
        lines.append(f"- Matched: {', '.join(row['matched_skills'])}")
        if row["other_languages"]:
            lines.append(
                f"- Also names languages outside the profile: {', '.join(row['other_languages'])}. "
                "Context only, not a filter: a polyglot shop can still staff a TypeScript team."
            )
        lines.append("")

    lines += [
        "## Source",
        "",
        "Company data from [remoteintech/remote-jobs](https://github.com/remoteintech/remote-jobs), "
        "a community directory of remote-friendly companies. It lists companies with a careers "
        "link, not open vacancies, so treat each row as a target to check rather than a live job.",
        "",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

DEFAULT_COMPANIES = str(Path(__file__).resolve().parent.parent / "companies")
DEFAULT_PROFILE = str(Path(__file__).resolve().parent.parent / "triage-profile.json")
DEFAULT_OUT = str(Path(__file__).resolve().parent.parent / "out")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--companies-dir", default=DEFAULT_COMPANIES)
    parser.add_argument("--profile", default=DEFAULT_PROFILE)
    parser.add_argument("--out-dir", default=DEFAULT_OUT)
    parser.add_argument("--top", type=int, default=40, help="rows shown in the markdown report (0 = all)")
    parser.add_argument("--today", default=None, help="override today's date (YYYY-MM-DD)")
    args = parser.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()

    companies = [
        company
        for company in (load_company(path) for path in sorted(Path(args.companies_dir).glob("*.md")))
        if company is not None
    ]
    profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))

    rows, funnel = build_shortlist(companies, profile, today)

    # The report is a shortlist; the JSON keeps every candidate for the CRM.
    shown = rows[: args.top] if args.top else rows

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    report = render_markdown(rows, funnel, profile, today, detail_rows=shown)
    (out_dir / "shortlist-remote-companies.md").write_text(report, encoding="utf-8")

    payload = {
        "generated": today.isoformat(),
        "source": "remoteintech/remote-jobs",
        "profile": str(args.profile),
        "funnel": funnel,
        "rows": rows,
    }
    (out_dir / "shortlist-remote-companies.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(json.dumps(funnel, indent=2))
    print(f"\ncandidates: {len(rows)} (report shows {len(shown)})")
    print(f"wrote {out_dir / 'shortlist-remote-companies.md'}")
    print(f"wrote {out_dir / 'shortlist-remote-companies.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

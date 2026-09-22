#!/usr/bin/env python3
"""Tests for the remote company shortlist tool.

Run: python3 -m unittest discover -s tools -p 'test_*.py' -v
or:  python3 tools/test_shortlist_remote_companies.py
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "shortlist", HERE / "shortlist_remote_companies.py"
)
sl = importlib.util.module_from_spec(SPEC)
sys.modules["shortlist"] = sl
SPEC.loader.exec_module(sl)

TODAY = date(2026, 9, 20)

PROFILE = {
    "skills": [
        "Angular",
        "AngularJS",
        "TypeScript",
        "NestJS",
        "Node.js",
        "RxJS",
        "Stencil.js",
        "Web Components",
        "PostgreSQL",
        "Docker",
        "React",
        "Python",
        "i18n",
    ],
    "skill_depth": {
        "primary_daily": ["Angular", "TypeScript", "RxJS", "Node.js", "NestJS"],
        "production_experience": [
            "Angular 18 (Disney Parks)",
            "Stencil.js / Web Components",
            "AngularJS (maintenance and migration)",
            "PostgreSQL",
            "Docker",
        ],
        "personal_projects": ["NixOS", "Linux"],
        "transferable_not_primary": [
            "React (production use 2021-2022, but not the main stack)",
            "Python (used where needed, not a primary language)",
        ],
    },
}


def company_md(
    title: str,
    slug: str,
    careers: str | None = "https://example.test/careers",
    region: str = "europe",
    remote: str = "fully-remote",
    size: str = "medium",
    tags: tuple[str, ...] = ("javascript",),
    prose: str = "TypeScript, Angular, Node.js",
    updated: str = "2026-06-01",
) -> str:
    tag_block = "\n".join(f"  - {tag}" for tag in tags)
    careers_line = f"careers_url: {careers}\n" if careers else ""
    updated_line = f"updatedAt: {updated}\n" if updated else ""
    return (
        "---\n"
        f'title: "{title}"\n'
        f"slug: {slug}\n"
        f"website: https://{slug}.test\n"
        f"{careers_line}"
        f"region: {region}\n"
        f"remote_policy: {remote}\n"
        f"company_size: {size}\n"
        "technologies:\n"
        f"{tag_block}\n"
        "addedAt: 2020-01-01\n"
        f"{updated_line}"
        "---\n"
        "\n"
        "## Company blurb\n"
        "\n"
        f"{title} builds things.\n"
        "\n"
        "## Company technologies\n"
        "\n"
        f"{prose}\n"
        "\n"
        "## Region\n"
        "\n"
        "Remote across Europe.\n"
    )


class TempCorpus(unittest.TestCase):
    """Base case that writes company files into a throwaway corpus directory."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, name: str, content: str) -> Path:
        path = self.dir / f"{name}.md"
        path.write_text(content, encoding="utf-8")
        return path

    def load_all(self) -> list:
        return [
            company
            for company in (
                sl.load_company(path) for path in sorted(self.dir.glob("*.md"))
            )
            if company is not None
        ]


class TestFrontmatter(TempCorpus):
    def test_parses_scalars_and_the_technologies_list(self):
        path = self.write("acme", company_md("Acme", "acme", tags=("javascript", "go")))
        scalars, technologies, body = sl.parse_frontmatter(path.read_text(encoding="utf-8"))
        self.assertEqual(scalars["title"], "Acme")
        self.assertEqual(scalars["slug"], "acme")
        self.assertEqual(scalars["region"], "europe")
        self.assertEqual(technologies, ["javascript", "go"])
        self.assertIn("## Company blurb", body)

    def test_parses_scalars_that_follow_the_list(self):
        # addedAt/updatedAt sit after the technologies list. If the list state is
        # not reset they are swallowed as list items.
        path = self.write("acme", company_md("Acme", "acme"))
        scalars, _, _ = sl.parse_frontmatter(path.read_text(encoding="utf-8"))
        self.assertEqual(scalars["updatedAt"], "2026-06-01")
        self.assertEqual(scalars["addedAt"], "2020-01-01")

    def test_missing_careers_url_is_not_an_empty_string(self):
        path = self.write("acme", company_md("Acme", "acme", careers=None))
        scalars, _, _ = sl.parse_frontmatter(path.read_text(encoding="utf-8"))
        self.assertNotIn("careers_url", scalars)

    def test_tolerates_crlf_line_endings(self):
        raw = company_md("Acme", "acme", tags=("javascript",)).replace("\n", "\r\n")
        path = self.write("acme", raw)
        company = sl.load_company(path)
        self.assertIsNotNone(company)
        self.assertEqual(company.technologies, ["javascript"])
        self.assertEqual(company.region, "europe")

    def test_returns_none_without_frontmatter(self):
        path = self.write("plain", "# Just a heading\n\nNo frontmatter here.\n")
        self.assertIsNone(sl.parse_frontmatter(path.read_text(encoding="utf-8")))

    def test_quoted_values_are_unquoted(self):
        path = self.write("acme", company_md("Acme Ltd", "acme"))
        scalars, _, _ = sl.parse_frontmatter(path.read_text(encoding="utf-8"))
        self.assertEqual(scalars["title"], "Acme Ltd")


class TestSections(TempCorpus):
    def test_section_stops_at_the_next_h2(self):
        path = self.write("acme", company_md("Acme", "acme", prose="Angular, TypeScript"))
        company = sl.load_company(path)
        self.assertEqual(company.technologies_section, "Angular, TypeScript")
        self.assertNotIn("Remote across Europe", company.technologies_section)

    def test_missing_section_is_empty_not_none(self):
        raw = """---
title: "Bare"
slug: bare
website: https://bare.test
region: europe
remote_policy: fully-remote
company_size: small
technologies:
  - javascript
updatedAt: 2026-01-01
---

## Company blurb

Nothing else here.
"""
        path = self.write("bare", raw)
        company = sl.load_company(path)
        self.assertEqual(company.technologies_section, "")
        self.assertEqual(company.region_section, "")

    def test_keeps_the_region_section_separate(self):
        path = self.write("acme", company_md("Acme", "acme"))
        company = sl.load_company(path)
        self.assertEqual(company.region_section, "Remote across Europe.")


class TestSkillWeights(unittest.TestCase):
    def setUp(self) -> None:
        self.weights = sl.skill_weights(PROFILE)

    def test_primary_daily_skills_weigh_the_most(self):
        for skill in ("Angular", "TypeScript", "RxJS", "Node.js", "NestJS"):
            self.assertEqual(self.weights[skill], 5.0, skill)

    def test_production_skills_get_the_middle_weight(self):
        for skill in ("PostgreSQL", "Docker", "AngularJS"):
            self.assertEqual(self.weights[skill], 3.0, skill)

    def test_multi_skill_entry_keeps_its_weight_for_every_token(self):
        # "Stencil.js / Web Components" must not lose one of its two skills.
        self.assertEqual(self.weights["Stencil.js"], 3.0)
        self.assertEqual(self.weights["Web Components"], 3.0)

    def test_entry_with_a_parenthetical_still_matches(self):
        # "Angular 18 (Disney Parks)" must reinforce Angular, not be skipped.
        self.assertEqual(self.weights["Angular"], 5.0)

    def test_transferable_skills_weigh_the_least(self):
        self.assertEqual(self.weights["React"], 1.0)
        self.assertEqual(self.weights["Python"], 1.0)

    def test_unclassified_listed_skill_still_counts(self):
        # i18n is in `skills` but nowhere in skill_depth.
        self.assertEqual(self.weights["i18n"], 1.0)

    def test_missing_skill_depth_does_not_crash(self):
        weights = sl.skill_weights({"skills": ["Docker"]})
        self.assertEqual(weights["Docker"], 1.0)

    def test_unlisted_skills_never_get_a_weight(self):
        self.assertNotIn("Kubernetes", self.weights)


class TestMatching(TempCorpus):
    def test_reads_the_prose_not_the_tags(self):
        # This is the whole point: the corpus tags almost nothing useful.
        path = self.write(
            "acme",
            company_md("Acme", "acme", tags=("go", "rust"), prose="Go, Rust, Angular, TypeScript"),
        )
        company = sl.load_company(path)
        matched = sl.match_skills(company, sl.skill_weights(PROFILE))
        self.assertIn("Angular", matched)
        self.assertIn("TypeScript", matched)

    def test_word_boundaries_prevent_false_positives(self):
        path = self.write(
            "acme",
            company_md("Acme", "acme", tags=("go",), prose="We are a reactive, networked team"),
        )
        company = sl.load_company(path)
        matched = sl.match_skills(company, sl.skill_weights(PROFILE))
        self.assertNotIn("React", matched)

    def test_angularjs_is_matched_as_its_own_skill(self):
        path = self.write("acme", company_md("Acme", "acme", prose="AngularJS and jQuery"))
        company = sl.load_company(path)
        matched = sl.match_skills(company, sl.skill_weights(PROFILE))
        self.assertIn("AngularJS", matched)

    def test_company_with_no_technologies_text_matches_nothing(self):
        raw = """---
title: "Empty"
slug: empty
website: https://empty.test
careers_url: https://empty.test/careers
region: europe
remote_policy: fully-remote
company_size: small
technologies:
updatedAt: 2026-01-01
---

## Company blurb

Nothing.
"""
        path = self.write("empty", raw)
        company = sl.load_company(path)
        self.assertEqual(sl.match_skills(company, sl.skill_weights(PROFILE)), [])


    def test_tags_alone_do_not_create_a_skill_match(self):
        # The regression this guards: match_skills used to read the frontmatter tags
        # as well, so a `nodejs` tag produced a Node.js match the prose never backed.
        weights = {"Angular": 5.0, "Node.js": 5.0, "Docker": 3.0}
        path = self.write(
            "acme",
            company_md("Acme", "acme", tags=("angular", "nodejs"), prose="Docker, Kubernetes"),
        )
        self.assertEqual(sl.match_skills(sl.load_company(path), weights), ["Docker"])

    def test_plural_variants_match(self):
        weights = {"WebSockets": 3.0, "Microfrontends": 3.0}
        path = self.write(
            "acme", company_md("Acme", "acme", prose="WebSockets and Microfrontends")
        )
        self.assertEqual(
            sl.match_skills(sl.load_company(path), weights), ["Microfrontends", "WebSockets"]
        )

    def test_postgresql_spelling_matches(self):
        weights = {"PostgreSQL": 3.0}
        path = self.write("acme", company_md("Acme", "acme", prose="PostgreSQL and Redis"))
        self.assertEqual(sl.match_skills(sl.load_company(path), weights), ["PostgreSQL"])


class TestOtherLanguages(TempCorpus):
    def test_prose_languages_are_reported(self):
        path = self.write(
            "acme", company_md("Acme", "acme", tags=("java",), prose="Java, Spring, Hibernate")
        )
        self.assertEqual(sl.other_languages(sl.load_company(path)), ["java"])

    def test_profile_languages_are_not_reported(self):
        path = self.write(
            "acme", company_md("Acme", "acme", prose="TypeScript, Angular, Node.js, Docker")
        )
        self.assertEqual(sl.other_languages(sl.load_company(path)), [])

    def test_tags_alone_do_not_produce_languages(self):
        # 636 of 884 companies in the corpus carry the `javascript` tag, which is
        # exactly why this reads the prose and not the tags.
        path = self.write(
            "acme", company_md("Acme", "acme", tags=("javascript",), prose="Docker, Kubernetes")
        )
        self.assertEqual(sl.other_languages(sl.load_company(path)), [])

    def test_a_language_named_only_in_a_tag_is_not_reported(self):
        path = self.write(
            "acme", company_md("Acme", "acme", tags=("java",), prose="TypeScript, Angular")
        )
        self.assertEqual(sl.other_languages(sl.load_company(path)), [])

    def test_spelling_variants_all_land(self):
        for prose, expected in (
            (".NET and C# services", [".net", "c#"]),
            ("dotnet core services", ["dotnet"]),
            ("Go and Rust services", ["go", "rust"]),
        ):
            path = self.write("acme", company_md("Acme", "acme", prose=prose))
            self.assertEqual(sl.other_languages(sl.load_company(path)), expected, prose)


class TestGatesAndRanking(TempCorpus):
    def build(self):
        return sl.build_shortlist(self.load_all(), PROFILE, TODAY)

    def test_without_careers_url_the_company_is_dropped(self):
        self.write("acme", company_md("Acme", "acme", careers=None, prose="Angular, TypeScript"))
        rows, funnel = self.build()
        self.assertEqual(rows, [])
        self.assertEqual(funnel["parsed"], 1)
        self.assertEqual(funnel["with_careers_url"], 0)

    def test_region_outside_the_target_markets_is_dropped(self):
        self.write("acme", company_md("Acme", "acme", region="americas", prose="Angular, TypeScript"))
        self.write("other", company_md("Other", "other", region="other", prose="Angular, TypeScript"))
        rows, funnel = self.build()
        self.assertEqual(rows, [])
        self.assertEqual(funnel["region_relevant"], 0)

    def test_stack_miss_is_dropped(self):
        self.write("acme", company_md("Acme", "acme", tags=("ruby",), prose="Ruby and Rails only"))
        rows, funnel = self.build()
        self.assertEqual(rows, [])
        self.assertEqual(funnel["stack_match"], 0)

    def test_transferable_only_match_is_not_a_candidate(self):
        # React is transferable for this profile, not primary, so a React-only
        # company does not belong in the shortlist even though it matched.
        self.write("acme", company_md("Acme", "acme", prose="React and Redux"))
        rows, funnel = self.build()
        self.assertEqual(rows, [])
        self.assertEqual(funnel["stack_match"], 1)
        self.assertEqual(funnel["primary_stack"], 0)

    def test_rows_point_at_the_profile_file(self):
        self.write("acme", company_md("Acme", "acme", prose="Angular, TypeScript"))
        rows, _ = self.build()
        self.assertEqual(rows[0]["file"], "acme.md")
        self.assertTrue(rows[0]["profile_path"].endswith("acme.md"))

    def test_funnel_is_monotonic(self):
        self.write("a", company_md("A", "a", prose="Angular, TypeScript"))
        self.write("b", company_md("B", "b", careers=None, prose="Angular, TypeScript"))
        self.write("c", company_md("C", "c", region="americas", prose="Angular, TypeScript"))
        self.write("d", company_md("D", "d", tags=("ruby",), prose="Ruby only"))
        _, funnel = self.build()
        counts = [
            funnel["parsed"],
            funnel["with_careers_url"],
            funnel["region_relevant"],
            funnel["stack_match"],
        ]
        self.assertEqual(counts, sorted(counts, reverse=True))
        self.assertEqual(funnel, {
            "parsed": 4,
            "with_careers_url": 3,
            "region_relevant": 2,
            "stack_match": 1,
            "primary_stack": 1,
            "pure_profile_stack": 1,
        })

    def test_fully_remote_europe_beats_hybrid_asia_pacific(self):
        self.write(
            "strong",
            company_md("Strong", "strong", region="europe", remote="fully-remote",
                       prose="Angular, TypeScript, NestJS"),
        )
        self.write(
            "weak",
            company_md("Weak", "weak", region="asia-pacific", remote="hybrid",
                       prose="Angular"),
        )
        rows, _ = self.build()
        self.assertEqual(rows[0]["slug"], "strong")
        self.assertEqual(rows[-1]["slug"], "weak")
        self.assertGreater(rows[0]["score"], rows[-1]["score"])

    def test_deeper_stack_outranks_shallower_at_equal_region(self):
        self.write(
            "deep",
            company_md("Deep", "deep", prose="Angular, TypeScript, NestJS, RxJS"),
        )
        self.write(
            "shallow",
            company_md("Shallow", "shallow", prose="Docker only"),
        )
        rows, _ = self.build()
        self.assertEqual(rows[0]["slug"], "deep")

    def test_fresh_profile_is_flagged_and_bonused(self):
        self.write("fresh", company_md("Fresh", "fresh", prose="Angular, TypeScript", updated="2026-08-01"))
        self.write("old", company_md("Old", "old", prose="Angular, TypeScript", updated="2020-01-01"))
        rows, _ = self.build()
        by_slug = {row["slug"]: row for row in rows}
        self.assertTrue(by_slug["fresh"]["fresh_profile"])
        self.assertFalse(by_slug["old"]["fresh_profile"])
        self.assertEqual(by_slug["fresh"]["score"] - by_slug["old"]["score"], sl.FRESH_BONUS)

    def test_a_profile_without_a_date_is_not_fresh(self):
        self.write("nodate", company_md("No date", "nodate", prose="Angular, TypeScript", updated=None))
        rows, _ = self.build()
        self.assertFalse(rows[0]["fresh_profile"])
        self.assertIsNone(rows[0]["months_since_update"])

    def test_other_languages_are_recorded_without_dropping_the_row(self):
        # A polyglot shop that also runs Java must stay on the list: the profile's
        # stack is present, and a company is not a job posting.
        self.write("mixed", company_md("Mixed", "mixed", tags=("java",), prose="Java, TypeScript, Angular"))
        rows, _ = self.build()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["other_languages"], ["java"])
        self.assertIn("Angular", rows[0]["matched_skills"])

    def test_output_is_deterministic(self):
        self.write("a", company_md("A", "a", prose="Angular, TypeScript"))
        self.write("b", company_md("B", "b", prose="Angular"))
        first, _ = self.build()
        second, _ = self.build()
        self.assertEqual(first, second)

    def test_row_carries_the_careers_url(self):
        self.write("acme", company_md("Acme", "acme", careers="https://acme.test/jobs"))
        rows, _ = self.build()
        self.assertEqual(rows[0]["careers_url"], "https://acme.test/jobs")


class TestRendering(TempCorpus):
    def test_markdown_reports_the_funnel_and_the_links(self):
        self.write("acme", company_md("Acme", "acme", prose="Angular, TypeScript"))
        rows, funnel = sl.build_shortlist(self.load_all(), PROFILE, TODAY)
        report = sl.render_markdown(rows, funnel, PROFILE, TODAY)
        self.assertIn("# Remote company shortlist", report)
        self.assertIn(f"Companies parsed: {funnel['parsed']}", report)
        self.assertIn("https://example.test/careers", report)
        self.assertIn("how the ranking works", report.lower())

    def test_rendering_an_empty_shortlist_still_works(self):
        report = sl.render_markdown([], {"parsed": 0, "with_careers_url": 0,
                                         "region_relevant": 0, "stack_match": 0,
                                         "primary_stack": 0,
                                         "pure_profile_stack": 0}, PROFILE, TODAY)
        self.assertIn("Companies parsed: 0", report)


class TestRealCorpus(unittest.TestCase):
    """Locks the parser to the real remote-jobs corpus. Skipped when absent."""

    COMPANIES = Path(sl.DEFAULT_COMPANIES)
    PROFILE_PATH = Path(sl.DEFAULT_PROFILE)

    @classmethod
    def setUpClass(cls):
        if not cls.COMPANIES.is_dir() or not cls.PROFILE_PATH.is_file():
            raise unittest.SkipTest("real corpus or profile not present")

    def test_parses_the_whole_corpus(self):
        companies = [
            company
            for company in (
                sl.load_company(path) for path in sorted(self.COMPANIES.glob("*.md"))
            )
            if company is not None
        ]
        self.assertGreaterEqual(len(companies), 800)
        # A parser regression shows up here first: the frontmatter must yield
        # these fields for most of the corpus.
        with_region = sum(1 for company in companies if company.region)
        with_remote = sum(1 for company in companies if company.remote_policy)
        with_prose = sum(1 for company in companies if company.technologies_section)
        self.assertGreaterEqual(with_region, 800)
        self.assertGreaterEqual(with_remote, 800)
        self.assertGreaterEqual(with_prose, 750)

    def test_produces_a_usable_shortlist(self):
        companies = [
            company
            for company in (
                sl.load_company(path) for path in sorted(self.COMPANIES.glob("*.md"))
            )
            if company is not None
        ]
        profile = json.loads(self.PROFILE_PATH.read_text(encoding="utf-8"))
        rows, funnel = sl.build_shortlist(companies, profile, TODAY)

        self.assertGreaterEqual(funnel["with_careers_url"], 550)
        self.assertGreaterEqual(funnel["region_relevant"], 300)
        self.assertGreaterEqual(funnel["stack_match"], 80)
        self.assertGreaterEqual(funnel["primary_stack"], 40)
        # The primary-stack gate has to actually filter, not be a no-op.
        self.assertLess(funnel["primary_stack"], funnel["stack_match"])
        self.assertEqual(len(rows), funnel["primary_stack"])

        # Every row must be actionable and explainable.
        for row in rows:
            self.assertTrue(row["careers_url"].startswith("http"))
            self.assertTrue(row["matched_skills"])
            self.assertIsInstance(row["score"], float)
            # The frontmatter slug drifts from the filename in 45 profiles, so a row
            # has to carry a path that actually opens.
            self.assertTrue(Path(row["profile_path"]).is_file(), row["slug"])

        # Scores must be sorted descending.
        scores = [row["score"] for row in rows]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_known_angular_companies_are_found(self):
        wanted = {"bitwarden", "testgorilla"}
        slugs = set()
        for path in self.COMPANIES.glob("*.md"):
            company = sl.load_company(path)
            if company is None or company.slug not in wanted:
                continue
            matched = sl.match_skills(company, sl.skill_weights(
                json.loads(self.PROFILE_PATH.read_text(encoding="utf-8"))
            ))
            if company.slug == "bitwarden":
                self.assertIn("Angular", matched)
                self.assertIn("TypeScript", matched)
            slugs.add(company.slug)
        self.assertEqual(slugs, wanted)


if __name__ == "__main__":
    unittest.main(verbosity=2)

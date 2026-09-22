#!/usr/bin/env python3
"""Tests for the live vacancy ranker.

Run: python3 tools/test_rank_live_vacancies.py
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import rank_live_vacancies as rl  # noqa: E402

TODAY = date(2026, 9, 20)
PROFILE = {
    "roles": ["Senior Fullstack Developer", "Senior Frontend Engineer"],
    "skills": [
        "Angular",
        "TypeScript",
        "NestJS",
        "Node.js",
        "RxJS",
        "Docker",
        "PostgreSQL",
        "React",
        "Python",
    ],
    "skill_depth": {
        "primary_daily": ["Angular", "TypeScript", "RxJS", "Node.js", "NestJS"],
        "production_experience": ["PostgreSQL", "Docker"],
        "personal_projects": ["NixOS"],
        "transferable_not_primary": [
            "React (production use 2021-2022)",
            "Python (used where needed, not a primary language)",
        ],
    },
}


def job(
    title: str,
    company: str = "Acme GmbH",
    location: str = "Berlin",
    posted: str | None = "2026-09-15",
    description: str = "",
    source: str = "arbeitnow",
    url: str | None = None,
) -> rl.Vacancy:
    slug = "".join(ch if ch.isalnum() else "-" for ch in f"{title}-{company}").lower()
    return rl.Vacancy(
        source=source,
        id=slug,
        title=title,
        company=company,
        location=location,
        date=posted,
        url=url or f"https://example.test/{slug}",
        description=description,
    )


def weights() -> dict[str, float]:
    return rl.skill_weights(PROFILE)


class TestLoader(unittest.TestCase):
    def write(self, payload: dict) -> list[str]:
        tmp = Path(tempfile.mkdtemp()) / "feed.json"
        tmp.write_text(json.dumps(payload), encoding="utf-8")
        return [str(tmp)]

    def test_reads_the_cli_shape_and_ignores_meta(self):
        paths = self.write(
            {
                "meta": {"source": "arbeitnow", "total": 1, "pages": 6},
                "results": [
                    {
                        "id": "a",
                        "title": "Senior Angular Developer",
                        "company": "Acme",
                        "location": "Berlin",
                        "date": "2026-09-01",
                        "url": "https://example.test/a",
                        "description": "Angular and TypeScript.",
                    }
                ],
            }
        )
        vacancies = rl.load_vacancies(paths)
        self.assertEqual(len(vacancies), 1)
        self.assertEqual(vacancies[0].source, "arbeitnow")
        self.assertEqual(vacancies[0].title, "Senior Angular Developer")

    def test_entries_without_title_or_url_are_skipped(self):
        paths = self.write(
            {
                "meta": {"source": "remotive"},
                "results": [
                    {"id": "1", "title": "", "url": "https://example.test/1"},
                    {"id": "2", "title": "Angular Dev", "url": ""},
                    {"id": "3", "title": "Angular Dev", "url": "https://example.test/3"},
                ],
            }
        )
        self.assertEqual(len(rl.load_vacancies(paths)), 1)

    def test_source_falls_back_to_the_filename(self):
        tmp = Path(tempfile.mkdtemp()) / "remoteok.json"
        tmp.write_text(
            json.dumps({"results": [{"title": "Angular Dev", "url": "https://x.test/1"}]}),
            encoding="utf-8",
        )
        self.assertEqual(rl.load_vacancies([str(tmp)])[0].source, "remoteok")


class TestDedupe(unittest.TestCase):
    def test_same_url_twice_is_one_row(self):
        kept, removed = rl.dedupe([job("Angular Dev"), job("Angular Dev")])
        self.assertEqual(len(kept), 1)
        self.assertEqual(removed, 1)

    def test_same_job_cross_posted_under_two_links_is_one_row(self):
        kept, removed = rl.dedupe(
            [
                job("Angular Dev", url="https://board-a.test/x"),
                job("Angular Dev", url="https://board-b.test/y", source="remoteok"),
            ]
        )
        self.assertEqual(len(kept), 1)
        self.assertEqual(removed, 1)

    def test_different_jobs_survive(self):
        kept, removed = rl.dedupe([job("Angular Dev"), job("NestJS Engineer")])
        self.assertEqual(len(kept), 2)
        self.assertEqual(removed, 0)


class TestDisqualifiers(unittest.TestCase):
    def test_below_senior_title_trips(self):
        for title in ("Junior Angular Developer", "Werkstudent Frontend", "Intern Developer",
                      "Mid-level Fullstack Developer", "Praktikum Web Development"):
            self.assertTrue(rl.disqualified(job(title)), title)

    def test_a_senior_title_is_never_below_senior(self):
        self.assertFalse(rl.disqualified(job("Senior Angular Developer")))
        self.assertFalse(rl.disqualified(job("Junior to Senior Angular Developer")))

    def test_intern_does_not_fire_inside_internal(self):
        # Word boundaries: "internal tooling platforms" is not an internship.
        self.assertFalse(rl.disqualified(job("Senior Angular Developer", description="internal tooling platforms")))
        self.assertTrue(rl.disqualified(job("Senior Angular Developer", description="2 years of experience")))

    def test_short_experience_ask_trips_only_without_a_senior_title(self):
        self.assertTrue(rl.disqualified(job("Fullstack Developer", description="3+ years of experience")))
        self.assertTrue(rl.disqualified(job("Fullstack Developer", description="2-4 years of experience")))
        self.assertFalse(rl.disqualified(job("Fullstack Developer", description="8+ years of experience")))
        self.assertFalse(rl.disqualified(job("Senior Fullstack Developer", description="3+ years of experience")))

    def test_a_company_anniversary_is_not_an_experience_ask(self):
        # "100 Jahre Firmengeschichte" is how German companies date themselves. The
        # digit lookbehind keeps it from being read as "00 years of experience",
        # which rejected real vacancies in the first live run.
        self.assertFalse(
            rl.disqualified(
                job("Fullstack Developer", description="Seit 100 Jahre Firmengeschichte. Angular und TypeScript.")
            )
        )
        self.assertTrue(rl.disqualified(job("Fullstack Developer", description="2 jahre Erfahrung mit Angular.")))

    def test_a_spanish_experience_ask_trips_the_gate(self):
        # The Chilean feed writes its asks in Spanish. Before the Spanish forms were
        # in the pattern, "Buscamos 3 anos de experiencia" matched nothing, so the
        # seniority gate could not fire on that corpus at all and a mid-level posting
        # passed it silently. A gate that cannot fire on half the corpus is not a gate.
        self.assertTrue(
            rl.disqualified(
                job("Desarrollador Fullstack", description="Buscamos 3 años de experiencia con Angular.")
            )
        )
        self.assertTrue(
            rl.disqualified(
                job("Desarrollador Fullstack", description="2-4 anos de experiencia en Angular y TypeScript.")
            )
        )
        self.assertFalse(
            rl.disqualified(
                job("Desarrollador Fullstack", description="Buscamos 8 años de experiencia con Angular.")
            )
        )
        # A company's own age is not an ask about the candidate.
        self.assertFalse(
            rl.disqualified(
                job(
                    "Desarrollador Fullstack",
                    description="Empresa con 20 años de trayectoria. Angular y TypeScript.",
                )
            )
        )

    def test_working_student_is_below_senior(self):
        # The German board writes this one in English as often as it writes
        # "Werkstudent", and missing it puts a student posting in a senior's list.
        for title in ("Working Student Application Software Engineer", "Werkstudent Angular",
                      "Student Assistant Frontend", "Dual Student Software Engineering"):
            self.assertTrue(rl.disqualified(job(title)), title)

    def test_a_wish_for_experience_does_not_trip_the_gate(self):
        # "nice to have" is a wish, not a requirement. Squeezing a good job out of the
        # list costs more than letting a mid-level posting through.
        self.assertFalse(
            rl.disqualified(
                job("Senior Angular Developer", description="Must have Angular. Kotlin is a plus: 2 years would be ideal.")
            )
        )

    def test_a_title_that_names_an_outsider_stack_is_rejected(self):
        # The body is judged leniently, the title strictly. A role word like
        # "full-stack" must NOT clear this: it says nothing about the language.
        for title in (
            "Senior .NET Full-stack Developer",
            "Senior Java Fullstack Developer",
            "Senior Golang Developer",
            "Tech Lead Full-Stack Rails Engineer",
            "PHP Backend Developer",
        ):
            reasons = rl.disqualified(job(title, description="TypeScript is used on the frontend."))
            self.assertTrue(reasons, title)
            self.assertIn("title names a stack outside the profile", reasons[0], title)

    def test_a_ts_stack_in_the_title_clears_the_outsider_check(self):
        reasons = rl.disqualified(
            job("Fullstack Developer, Angular and .NET APIs", description="Angular, TypeScript.")
        )
        self.assertEqual([r for r in reasons if "title names" in r], [])

    def test_no_sponsorship_trips(self):
        self.assertTrue(
            rl.disqualified(job("Senior Angular Developer", description="We cannot sponsor visas."))
        )
        self.assertTrue(
            rl.disqualified(
                job("Senior NestJS Developer", description="Applicants must already have the right to work in the EU.")
            )
        )

    def test_offering_sponsorship_does_not_trip(self):
        self.assertFalse(
            rl.disqualified(
                job("Senior Angular Developer", description="We provide visa sponsorship and relocation support.")
            )
        )

    def test_onsite_in_another_country_without_relocation_trips(self):
        self.assertTrue(
            rl.disqualified(job("Senior Angular Developer", description="This is an on-site role in Munich."))
        )
        self.assertTrue(
            rl.disqualified(job("Senior Angular Developer", description="A hybrid role, three days vor Ort."))
        )

    def test_onsite_is_cleared_by_remote_or_relocation(self):
        self.assertFalse(
            rl.disqualified(
                job("Senior Angular Developer", description="Hybrid in Berlin with a relocation package.")
            )
        )
        self.assertFalse(
            rl.disqualified(
                job("Senior Angular Developer", description="On-site in Munich but the team is mostly remote.")
            )
        )

    def test_mobile_primary_trips_only_without_a_web_stack_in_the_title(self):
        self.assertTrue(rl.disqualified(job("Senior iOS Developer")))
        self.assertTrue(rl.disqualified(job("Android Developer (Kotlin)")))
        self.assertFalse(rl.disqualified(job("Fullstack Developer, Angular and Kotlin")))

    def test_management_title_trips_only_without_a_stack(self):
        self.assertTrue(rl.disqualified(job("Engineering Manager")))
        self.assertTrue(rl.disqualified(job("Head of Engineering")))
        self.assertFalse(rl.disqualified(job("Team Lead Angular Development")))

    def test_foreign_stack_trips_only_with_no_ts_js_at_all(self):
        self.assertTrue(rl.disqualified(job("Backend Engineer", description="Java, Spring, Hibernate.")))
        self.assertTrue(rl.disqualified(job("Backend Engineer", description="Go and Rust services.")))
        self.assertFalse(rl.disqualified(job("Backend Engineer", description="Java services with a TypeScript frontend.")))
        self.assertFalse(rl.disqualified(job("Backend Engineer", description="Mostly Java, some Angular.")))

    def test_residency_and_clearance_trip(self):
        self.assertTrue(rl.disqualified(job("Senior Angular Developer", description="Requires security clearance.")))
        self.assertTrue(
            rl.disqualified(job("Senior Angular Developer", description="Only candidates based in Germany."))
        )

    def test_plain_remote_europe_is_not_a_residency_restriction(self):
        self.assertFalse(
            rl.disqualified(job("Senior Angular Developer", description="Remote within European time zones."))
        )


class TestScoring(unittest.TestCase):
    def test_the_body_stack_contribution_is_capped(self):
        # Controlled: no remote wording, posted within the window, seven skills in the
        # body and none in the title. The score is the cap plus the title and freshness
        # bonuses, which is what stops a long list from buying rank.
        sink = job(
            "Senior Fullstack Developer",
            company="Aggregator",
            posted="2026-09-18",
            description="Angular, TypeScript, NestJS, RxJS, Node.js, PostgreSQL, Docker.",
        )
        score, matched, in_title, _ = rl.score_vacancy(sink, weights(), TODAY)
        self.assertEqual(in_title, [])
        self.assertGreater(len(matched), 4)
        self.assertEqual(
            score,
            rl.BODY_STACK_CAP + rl.TITLE_ROLE_BONUS + rl.TITLE_SENIOR_BONUS + rl.FRESH_BONUS,
        )

    def test_a_skill_in_the_title_outweighs_one_in_the_body(self):
        rows, _, _ = rl.build_ranking(
            [
                job("Senior Angular Developer", company="Title Co"),
                job("Backend Engineer", company="Body Co", description="You will touch Angular sometimes."),
            ],
            PROFILE,
            TODAY,
        )
        by_company = {row["company"]: row for row in rows}
        self.assertGreater(by_company["Title Co"]["score"], by_company["Body Co"]["score"])

    def test_a_richer_stack_scores_higher(self):
        rows, _, _ = rl.build_ranking(
            [
                job("Senior Fullstack Developer", company="Rich", description="Angular, TypeScript, NestJS, PostgreSQL, Docker, RxJS."),
                job("Senior Frontend Developer", company="Thin", description="Angular only."),
            ],
            PROFILE,
            TODAY,
        )
        by_company = {row["company"]: row for row in rows}
        self.assertGreater(by_company["Rich"]["score"], by_company["Thin"]["score"])

    def test_a_recent_posting_gets_the_fresh_bonus(self):
        rows, _, _ = rl.build_ranking(
            [
                job("Senior Angular Developer", company="New", posted="2026-09-18"),
                job("Senior Angular Developer", company="Old", posted="2026-05-01"),
            ],
            PROFILE,
            TODAY,
        )
        by_company = {row["company"]: row for row in rows}
        self.assertIn("posted recently", by_company["New"]["signals"])
        self.assertNotIn("posted recently", by_company["Old"]["signals"])

    def test_a_posting_past_the_window_is_not_fresh(self):
        # 49 dias de antiguedad. La aritmetica de meses calendario daba 1 ("un mes")
        # y lo premiaba como recien publicado: en produccion cobraban el bonus 15 de
        # 20 avisos de julio y 47 de 47 de agosto. Este es el caso que el bug tapaba.
        rows, _, _ = rl.build_ranking(
            [
                job("Senior Angular Developer", company="AlmostTwoMonths", posted="2026-08-02"),
                job("Senior Angular Developer", company="Yesterday", posted="2026-09-19"),
            ],
            PROFILE,
            TODAY,
        )
        by_company = {row["company"]: row for row in rows}
        self.assertNotIn("posted recently", by_company["AlmostTwoMonths"]["signals"])
        self.assertIn("posted recently", by_company["Yesterday"]["signals"])
        self.assertGreater(by_company["Yesterday"]["score"], by_company["AlmostTwoMonths"]["score"])

    def test_days_old_is_computed(self):
        rows, _, _ = rl.build_ranking([job("Senior Angular Developer", posted="2026-09-10")], PROFILE, TODAY)
        self.assertEqual(rows[0]["days_old"], 10)

    def test_a_job_with_no_stack_match_is_not_a_candidate(self):
        rows, _, funnel = rl.build_ranking(
            [job("Senior Tax Manager", description="Tax law, compliance, reporting.")], PROFILE, TODAY
        )
        self.assertEqual(rows, [])
        self.assertEqual(funnel["candidates"], 0)

    def test_ranking_is_deterministic(self):
        vacancies = [
            job("Senior Angular Developer", company="A"),
            job("Senior TypeScript Engineer", company="B"),
            job("NestJS Developer", company="C"),
        ]
        first, _, _ = rl.build_ranking(vacancies, PROFILE, TODAY)
        second, _, _ = rl.build_ranking(vacancies, PROFILE, TODAY)
        self.assertEqual(first, second)


class TestBuildRanking(unittest.TestCase):
    def test_rejected_jobs_carry_their_evidence(self):
        rows, rejected, funnel = rl.build_ranking(
            [
                job("Senior Angular Developer", company="Keep"),
                job("Senior Angular Developer", company="NoVisa", description="We cannot sponsor visas."),
            ],
            PROFILE,
            TODAY,
        )
        self.assertEqual([row["company"] for row in rows], ["Keep"])
        self.assertEqual(len(rejected), 1)
        self.assertIn("no sponsorship offered", rejected[0]["reasons"][0])
        self.assertEqual(funnel["disqualified"], 1)

    def test_funnel_counts_add_up(self):
        vacancies = [
            job("Senior Angular Developer", company="One"),
            job("Senior NestJS Developer", company="Two"),
            job("Engineering Manager", company="Managed"),
            job("Senior Tax Manager", company="NotTech", description="pure tax law"),
        ]
        rows, rejected, funnel = rl.build_ranking(vacancies, PROFILE, TODAY)
        self.assertEqual(funnel["loaded"], 4)
        self.assertEqual(funnel["disqualified"], 1)
        self.assertEqual(funnel["candidates"], 2)
        self.assertEqual(len(rows), 2)
        self.assertEqual(len(rejected), 1)
        # The funnel has to account for every row it loaded, or it is not an audit
        # trail. This is how the first live run hid 456 unmatched postings.
        accounted = (
            funnel["candidates"]
            + funnel["disqualified"]
            + funnel["no_primary_skill"]
            + funnel["no_profile_skill"]
            + funnel["no_title_signal"]
        )
        self.assertEqual(accounted, funnel["loaded"])

    def test_a_title_with_no_profile_role_is_not_a_candidate(self):
        rows, _, funnel = rl.build_ranking(
            [job("Senior Data Scientist", description="Angular, TypeScript and NestJS for internal tooling.")],
            PROFILE,
            TODAY,
        )
        self.assertEqual(rows, [])
        self.assertEqual(funnel["no_title_signal"], 1)
        self.assertEqual(funnel["candidates"], 0)

    def test_a_job_with_no_daily_stack_skill_is_rejected_with_evidence(self):
        rows, rejected, funnel = rl.build_ranking(
            [job("Senior Embedded Linux Engineer", description="Docker, Jenkins, Python and Linux kernels.")],
            PROFILE,
            TODAY,
        )
        self.assertEqual(rows, [])
        self.assertEqual(funnel["no_primary_skill"], 1)
        self.assertIn("no skill from the profile's daily stack", rejected[0]["reasons"][0])

    def test_a_role_word_in_the_title_is_enough(self):
        rows, _, funnel = rl.build_ranking(
            [job("Fullstack Developer", description="Angular, TypeScript.")], PROFILE, TODAY
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(funnel["no_title_signal"], 0)

    def test_the_copy_with_more_evidence_wins_on_dedupe(self):
        # La misma pega llega dos veces: el indice de la API sin descripcion y la
        # copia enriquecida. Sin esto, cual sobrevive depende del orden del glob.
        thin = rl.Vacancy(source="pegas-full", id="1", title="X", company="Y",
                          location=None, date=None, url="https://u/1", description="")
        rich = rl.Vacancy(source="pegas-devschile", id="1", title="X", company="Y",
                          location=None, date=None, url="https://u/1",
                          description="Angular y NestJS en produccion.")
        for order in ([thin, rich], [rich, thin]):
            kept, duplicates = rl.dedupe(order)
            self.assertEqual(duplicates, 1)
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0].source, "pegas-devschile")

    def test_scores_are_sorted_descending(self):
        rows, _, _ = rl.build_ranking(
            [
                job("Senior Fullstack Developer", company="Rich", description="Angular, TypeScript, NestJS, PostgreSQL."),
                job("Frontend Developer", company="Thin", description="Angular."),
            ],
            PROFILE,
            TODAY,
        )
        scores = [row["score"] for row in rows]
        self.assertEqual(scores, sorted(scores, reverse=True))


class TestRendering(unittest.TestCase):
    def test_report_includes_the_funnel_and_the_rejections(self):
        rows, rejected, funnel = rl.build_ranking(
            [
                job("Senior Angular Developer", company="Keep"),
                job("Senior Angular Developer", company="NoVisa", description="We cannot sponsor visas."),
            ],
            PROFILE,
            TODAY,
        )
        funnel["duplicates"] = 0
        report = rl.render_markdown(rows, rejected, funnel, TODAY)
        self.assertIn("Vacancies loaded: 2", report)
        self.assertIn("## Rejected, with the phrase that did it", report)
        self.assertIn("no sponsorship offered", report)

    def test_a_pipe_in_a_title_does_not_break_the_table(self):
        # Titulo real de getonbrd. Sin escapar, la fila queda con una columna de
        # mas y la tabla entera deja de renderizar.
        vacancies = [
            job(
                "Desarrollador/a Fullstack | React.js + NestJS/Node.js",
                description="Angular, NestJS y TypeScript.",
            )
        ]
        rows, rejected, funnel = rl.build_ranking(vacancies, PROFILE, TODAY)
        funnel["duplicates"] = 0
        report = rl.render_markdown(rows, rejected, funnel, TODAY)
        table = [line for line in report.splitlines() if line.startswith("|")]
        self.assertGreater(len(table), 2)
        widths = {len(re.split(r"(?<!\\)\|", line.strip().strip("|"))) for line in table}
        self.assertEqual(len(widths), 1, table)

    def test_a_pipe_in_a_url_is_encoded_not_escaped(self):
        # En un destino de link el `|` no se escapa con barra: rompe el link.
        self.assertEqual(rl.md_url("https://x.example/j?a=1|2"), "https://x.example/j?a=1%7C2")

    def test_empty_input_still_renders(self):
        report = rl.render_markdown([], [], {"loaded": 0, "duplicates": 0, "disqualified": 0,
                                             "no_profile_skill": 0, "no_primary_skill": 0,
                                             "no_title_signal": 0, "candidates": 0,
                                             "with_primary_stack": 0, "senior_titled": 0}, TODAY)
        self.assertIn("Vacancies loaded: 0", report)


if __name__ == "__main__":
    unittest.main(verbosity=2)

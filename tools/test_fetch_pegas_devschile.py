#!/usr/bin/env python3
"""Tests del fetcher de pegas.devschile.cl.

Sin red a proposito: lo que se prueba es el mapeo, la extraccion de texto y,
sobre todo, que el JSON que escribe lo pueda leer el ranker sin cambios. Si esa
ultima prueba pasa, los dos programas no pueden divergir.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import fetch_pegas_devschile as fp  # noqa: E402
import rank_live_vacancies as rl  # noqa: E402


def api_row(**overrides):
    row = {
        "id": 65995,
        "url": "https://www.getonbrd.com/jobs/full-stack-developer-apside-remote-961d",
        "titulo": "Full-Stack Developer Angular + NestJS",
        "empleador": "Apside",
        "descripcion": "Full-Stack Developer Angular + NestJS, Chile",
        "categoria": "Full Stack",
        "ubicacion": "Chile",
        "sueldo": "USD 1700 - 2200 /mes",
        "tags": None,
        "fecha_publicacion": "2026-09-21T13:04:42.000Z",
        "fuente": "getonbrd",
        "fecha_creacion": "2026-09-21T15:00:14.585Z",
    }
    row.update(overrides)
    return row


class TestParseApiRow(unittest.TestCase):
    def test_it_maps_the_api_row_onto_the_cli_shape(self):
        parsed = fp.parse_api_row(api_row())
        self.assertEqual(parsed["id"], "65995")
        self.assertEqual(parsed["title"], "Full-Stack Developer Angular + NestJS")
        self.assertEqual(parsed["company"], "Apside")
        self.assertEqual(parsed["location"], "Chile")
        self.assertEqual(parsed["url"], api_row()["url"])
        # El ranker solo lee estas claves; que existan es el contrato.
        for key in ("id", "title", "company", "location", "date", "url", "description"):
            self.assertIn(key, parsed)

    def test_the_api_id_is_always_a_string(self):
        # El ranker lo usa como clave de cache y de dedupe: un int ahi rompe la
        # comparacion contra los ids de texto del CLI.
        self.assertIsInstance(fp.parse_api_row(api_row(id=12345))["id"], str)

    def test_iso_timestamp_is_reduced_to_a_date(self):
        # El ranker compara fechas YYYY-MM-DD; la API manda ISO con hora y zona.
        self.assertEqual(fp.parse_api_row(api_row())["date"], "2026-09-21")

    def test_a_missing_publication_date_stays_none(self):
        self.assertIsNone(fp.parse_api_row(api_row(fecha_publicacion=None))["date"])
        self.assertIsNone(fp.parse_api_row(api_row(fecha_publicacion=""))["date"])

    def test_placeholder_employer_becomes_none(self):
        # El portal escribe "No especificado" en vez de dejar el campo vacio, y
        # eso ensucia el dedupe por titulo+empleador.
        for placeholder in ("No especificado", "no especificada", "", "N/A", "-"):
            self.assertIsNone(fp.parse_api_row(api_row(empleador=placeholder))["company"])

    def test_rows_without_title_or_url_are_dropped(self):
        self.assertIsNone(fp.parse_api_row(api_row(titulo="")))
        self.assertIsNone(fp.parse_api_row(api_row(url="   ")))

    def test_salary_and_category_survive(self):
        # Es el dato que decide a cual postular y el unico que la API agrega
        # sobre los feeds internacionales.
        parsed = fp.parse_api_row(api_row())
        self.assertEqual(parsed["salary"], "USD 1700 - 2200 /mes")
        self.assertEqual(parsed["category"], "Full Stack")
        self.assertEqual(parsed["portal_source"], "getonbrd")

    def test_an_empty_salary_stays_none(self):
        self.assertIsNone(fp.parse_api_row(api_row(sueldo=None))["salary"])
        self.assertIsNone(fp.parse_api_row(api_row(sueldo=""))["salary"])

    def test_the_index_description_is_not_carried_as_a_description(self):
        # Los 59 chars de "titulo, ubicacion" que manda la API no son una
        # descripcion. Si se copiaran, el ranker creeria que gateo sobre texto
        # real y no sobre el titulo.
        self.assertEqual(fp.parse_api_row(api_row())["description"], "")


class TestExtractText(unittest.TestCase):
    def test_scripts_styles_and_tags_are_removed(self):
        markup = (
            "<html><head><style>.a{color:red}</style>"
            "<script>var secret='angular';</script></head>"
            "<body><h1>Senior Angular</h1><p>NestJS y PostgreSQL</p></body></html>"
        )
        text = fp.extract_text(markup)
        self.assertNotIn("secret", text)
        self.assertNotIn("color:red", text)
        self.assertNotIn("<", text)
        self.assertIn("Senior Angular", text)
        self.assertIn("NestJS y PostgreSQL", text)

    def test_noscript_and_svg_are_removed_too(self):
        markup = "<noscript>Activa JS</noscript><svg><path d='M0 0'/></svg><p>Angular</p>"
        text = fp.extract_text(markup)
        self.assertNotIn("Activa JS", text)
        self.assertNotIn("M0 0", text)
        self.assertIn("Angular", text)

    def test_comments_are_removed(self):
        self.assertEqual(fp.extract_text("<p>Angular</p><!-- nestjs interno -->"), "Angular")

    def test_entities_are_unescaped(self):
        # getonbrd manda tildes y ampersands escapados; sin desescapar, "I&amp;D"
        # no matchea contra el perfil y "Antofagasta" llega rota.
        text = fp.extract_text("<p>I&amp;D en Antofagasta &aacute;rea</p>")
        self.assertIn("I&D", text)
        self.assertIn("área", text)

    def test_whitespace_is_collapsed(self):
        text = fp.extract_text("<p>Angular\n\n   NestJS</p>\n\n<p>RxJS</p>")
        self.assertEqual(text, "Angular NestJS RxJS")

    def test_output_is_capped(self):
        text = fp.extract_text("<p>" + ("angular " * 5000) + "</p>", max_chars=100)
        self.assertEqual(len(text), 100)

    def test_empty_markup_gives_empty_text(self):
        self.assertEqual(fp.extract_text(""), "")
        self.assertEqual(fp.extract_text("<div></div>"), "")


class TestContainerExtraction(unittest.TestCase):
    """El pie de pagina no puede entrar al texto: corrompe el ranking."""

    LINKEDIN_HTML = (
        '<html><body><nav>Jobs People Learning</nav>'
        '<div class="description__text description__text--rich">'
        "<p>Angular 18 y NestJS en produccion.</p></div>"
        "<footer>About Accessibility User Agreement Privacy Policy</footer>"
        "</body></html>"
    )

    def test_the_linkedin_container_drops_the_page_footer(self):
        text = fp.extract_text(self.LINKEDIN_HTML, url="https://www.linkedin.com/jobs/view/1/")
        self.assertIn("Angular 18", text)
        self.assertNotIn("Accessibility", text)
        self.assertNotIn("Privacy Policy", text)

    def test_getonbrd_joins_its_several_containers(self):
        # getonbrd parte el aviso: una seccion de descripcion y otra de requisitos.
        markup = (
            '<div class="gb-rich-txt">Buscamos un Frontend Angular.</div>'
            '<div class="gb-rich-txt">Requisitos: TypeScript y RxJS.</div>'
        )
        text = fp.extract_text(markup, url="https://www.getonbrd.com/jobs/x-961d")
        self.assertIn("Frontend Angular", text)
        self.assertIn("TypeScript y RxJS", text)

    def test_an_unknown_source_falls_back_to_the_whole_page(self):
        markup = "<html><body><p>Angular y NestJS</p></body></html>"
        text = fp.extract_text(markup, url="https://example.com/job/1")
        self.assertIn("Angular y NestJS", text)

    def test_a_missing_container_falls_back_and_reports_it(self):
        # Si la fuente cambia su DOM, el texto sigue saliendo: degrada, no rompe.
        markup = "<html><body><p>Angular y NestJS</p></body></html>"
        text, scoped = fp.jd_text(markup, url="https://www.linkedin.com/jobs/view/1/")
        self.assertIn("Angular y NestJS", text)
        self.assertFalse(scoped)

    def test_a_recognised_container_reports_itself_as_scoped(self):
        text, scoped = fp.jd_text(self.LINKEDIN_HTML, url="https://www.linkedin.com/jobs/view/1/")
        self.assertTrue(scoped)
        self.assertNotIn("Accessibility", text)

    def test_container_lookup_matches_the_domain_and_its_subdomains(self):
        for url in ("https://linkedin.com/jobs/view/1",
                    "https://www.linkedin.com/jobs/view/1",
                    "https://cl.linkedin.com/jobs/view/1"):
            self.assertIsNotNone(fp.container_for(url), url)
        for url in ("https://notlinkedin.com/jobs/1",
                    "https://linkedin.com.evil.example/jobs/1",
                    "https://example.com/jobs/1",
                    ""):
            self.assertIsNone(fp.container_for(url), url)

    def test_void_tags_do_not_break_the_subtree_text(self):
        # <br> y <img> no se cierran: si contaran como profundidad, el texto del
        # contenedor quedaria cortado a la mitad.
        markup = (
            '<div class="description__text">Angular<br>NestJS<img src="x.png">RxJS</div>'
        )
        text = fp.extract_text(markup, url="https://www.linkedin.com/jobs/view/1/")
        self.assertIn("Angular", text)
        self.assertIn("RxJS", text)


class TestEnrichScoping(unittest.TestCase):
    def test_scoped_and_unscoped_rows_are_counted_apart(self):
        linkedin_html = TestContainerExtraction.LINKEDIN_HTML
        plain_html = "<html><body><p>Solo Angular</p></body></html>"

        def fake_request(url, timeout=30):
            return (linkedin_html if "linkedin" in url else plain_html).encode()

        rows = [
            fp.parse_api_row(api_row(id=1, url="https://www.linkedin.com/jobs/view/1/")),
            fp.parse_api_row(api_row(id=2, url="https://example.com/job/2", titulo="Otra")),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(fp, "CACHE_DIR", Path(tmp)), \
                 mock.patch.object(fp, "request", fake_request):
                stats = fp.enrich(rows, limit=10, delay=0, refresh=True, verbose=False)

        self.assertEqual(stats["enriched"], 2)
        self.assertEqual(stats["scoped"], 1)
        self.assertEqual(stats["unscoped"], 1)
        self.assertEqual(stats["failed"], 0)
        self.assertNotIn("accessibility", rows[0]["description"].lower())
        self.assertIn("angular", rows[0]["description"].lower())

    def test_a_source_that_fails_does_not_stop_the_run(self):
        def fake_request(url, timeout=30):
            if "linkedin" in url:
                raise OSError("connection reset")
            return b"<html><body><p>Angular</p></body></html>"

        rows = [
            fp.parse_api_row(api_row(id=1, url="https://www.linkedin.com/jobs/view/1/")),
            fp.parse_api_row(api_row(id=2, url="https://example.com/job/2", titulo="Otra")),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(fp, "CACHE_DIR", Path(tmp)), \
                 mock.patch.object(fp, "request", fake_request):
                stats = fp.enrich(rows, limit=10, delay=0, refresh=True, verbose=False)

        self.assertEqual(stats["failed"], 1)
        self.assertEqual(stats["enriched"], 1)
        self.assertEqual(rows[1]["description"], "Angular")


class TestDedupeRows(unittest.TestCase):
    def test_a_row_seen_in_two_queries_is_kept_once(self):
        # "Full-Stack Developer Angular + NestJS" sale en la busqueda de angular
        # y en la de nestjs: la misma pega, contada dos veces.
        rows = [fp.parse_api_row(api_row()), fp.parse_api_row(api_row())]
        unique, repeated = fp.dedupe_rows(rows)
        self.assertEqual(len(unique), 1)
        self.assertEqual(repeated, 1)

    def test_distinct_rows_are_all_kept(self):
        rows = [
            fp.parse_api_row(api_row()),
            fp.parse_api_row(api_row(id=2, titulo="Otro aviso")),
        ]
        unique, repeated = fp.dedupe_rows(rows)
        self.assertEqual(len(unique), 2)
        self.assertEqual(repeated, 0)


class TestBuildPayload(unittest.TestCase):
    def test_source_is_the_key_the_ranker_reads(self):
        payload = fp.build_payload([], {"total": 1615, "actualizado": "2026-09-21T15:00:14.585Z"}, 0)
        self.assertEqual(payload["meta"]["source"], "pegas-devschile")

    def test_meta_carries_the_provenance_for_auditing(self):
        payload = fp.build_payload([], {"total": 1615, "actualizado": "2026-09-21T15:00:14.585Z"}, 3)
        meta = payload["meta"]
        self.assertEqual(meta["universe"], 1615)
        self.assertEqual(meta["updated"], "2026-09-21T15:00:14.585Z")
        self.assertEqual(meta["skipped_incomplete"], 3)
        self.assertIn("devschile/pegas", meta["repository"])


class TestRankerReadsThisOutput(unittest.TestCase):
    """La prueba que importa: el ranker consume el JSON del fetcher sin cambios."""

    def test_load_vacancies_reads_the_payload(self):
        row = fp.parse_api_row(api_row())
        row["description"] = fp.extract_text("<p>Angular 18, NestJS y RxJS en produccion.</p>")
        payload = fp.build_payload([row], {"total": 1}, 0)

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "pegas-devschile.json"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            vacancies = rl.load_vacancies([str(path)])

        self.assertEqual(len(vacancies), 1)
        vacancy = vacancies[0]
        self.assertEqual(vacancy.source, "pegas-devschile")
        self.assertEqual(vacancy.title, "Full-Stack Developer Angular + NestJS")
        self.assertEqual(vacancy.company, "Apside")
        self.assertEqual(vacancy.date, "2026-09-21")
        self.assertEqual(vacancy.salary, "USD 1700 - 2200 /mes")
        self.assertIn("nestjs", vacancy.text)

    def test_an_enriched_row_is_ranked_and_a_bare_row_is_not_penalised_into_a_crash(self):
        enriched = fp.parse_api_row(api_row())
        enriched["description"] = "Angular, NestJS, TypeScript, RxJS y PostgreSQL."
        bare = fp.parse_api_row(api_row(id=2, titulo="Vendedor de seguros", empleador="X"))
        payload = fp.build_payload([enriched, bare], {"total": 2}, 0)

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "pegas-devschile.json"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            vacancies = rl.load_vacancies([str(path)])

        # Perfil de ejemplo que vive en el repo. Los tests no pueden depender del
        # perfil personal de quien clona: el de la app se exporta desde Settings y
        # no esta versionado.
        fixture = Path(__file__).resolve().parent / "fixtures" / "triage-profile.example.json"
        profile = json.loads(fixture.read_text(encoding="utf-8"))
        weights = rl.skill_weights(profile)
        rows, rejected, funnel = rl.build_ranking(vacancies, profile, rl.date(2026, 9, 21))
        self.assertEqual(funnel["loaded"], 2)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["company"], "Apside")
        self.assertEqual(rows[0]["salary"], "USD 1700 - 2200 /mes")


if __name__ == "__main__":
    unittest.main(verbosity=2)

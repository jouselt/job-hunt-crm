#!/usr/bin/env python3
"""Genera el fixture dorado que prueba que el port a TypeScript es fiel.

El backend reimplementa el scoring en `vacancy-scoring.ts`. Una reimplementacion
sin prueba de equivalencia es una segunda verdad: los dos lados dicen numeros
distintos sobre la misma oferta y nadie se entera hasta que una postulacion se
pierde. Este script corre las MISMAS entradas por el Python (la fuente) y escribe
los resultados esperados; el spec de Jest corre esas entradas por el TypeScript y
exige que coincidan campo por campo.

Los casos son dos: los sinteticos, que nombran la regla que ejercitan y cubren
cada rama (incluidas las que se arreglaron por bugs reales), y el corpus, que son
vacantes reales del feed con el texto recortado para que el fixture se pueda
revisar en un diff.

El perfil NO se escribe aca: se le pasa el JSON que exporta el propio backend, asi
que el fixture compara contra el perfil que la app realmente usa.

Uso:
    python3 tools/generate_scoring_golden.py \
        --profile /tmp/app-profile.json \
        --corpus /tmp/vac/pegas-devschile.json \
        --out <repo>/backend/test/fixtures/scoring-golden.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import rank_live_vacancies as ranker  # noqa: E402

# Fecha fija para que el bonus de frescura sea reproducible. Va en el fixture.
TODAY = dt.date(2026, 9, 21)

# (nombre, titulo, empresa, ubicacion, descripcion, fecha)
SYNTHETIC: list[tuple[str, str, str | None, str | None, str, str | None]] = [
    (
        "exact-match-angular-nestjs-chile",
        "Full-Stack Developer Angular + NestJS - Sector Salud",
        "Apside",
        "Chile",
        "Buscamos un desarrollador full-stack con Angular y NestJS. Trabajo remoto. TypeScript y RxJS en el dia a dia.",
        "2026-09-20",
    ),
    (
        "senior-angular-remote",
        "Senior Frontend Engineer (Angular)",
        "Improving",
        "Remote - Chile",
        "Senior front-end engineer. Angular 18, TypeScript, RxJS y NgRx. Modalidad 100% remoto.",
        "2026-09-15",
    ),
    (
        "angularjs-carries-its-own-lower-weight",
        "Frontend Developer AngularJS",
        "Legacy Corp",
        "Remote",
        "Mantenimiento de aplicaciones AngularJS con migracion progresiva. Sin mencion de otro framework.",
        "2026-09-10",
    ),
    (
        "node-token-reaches-nodejs-skill",
        "Backend Engineer Node",
        "Acme",
        "Remote",
        "Servicios con Node, NestJS y PostgreSQL. API REST y BFF.",
        "2026-09-10",
    ),
    (
        "plural-websockets-matches-singular-keyword",
        "Senior Engineer (Web Components)",
        "Acme",
        "Remote",
        "Trabajamos con WebSockets y microfrontends. TypeScript obligatorio.",
        "2026-09-10",
    ),
    (
        "stencil-and-web-components",
        "Senior Frontend Developer",
        "Acme",
        "Remote",
        "Stencil.js y Web Components para un design system compartido. TypeScript.",
        "2026-09-10",
    ),
    (
        "rxjs-and-ngrx-in-body",
        "Frontend Developer",
        "Acme",
        "Remote",
        "Estado con NgRx, streams con RxJS sobre Angular.",
        "2026-09-10",
    ),
    (
        "working-student-is-below-senior",
        "Working Student Application Software Engineer",
        "SAP",
        "Walldorf",
        "Support the team with TypeScript and Angular while you study.",
        "2026-09-10",
    ),
    (
        "senior-title-with-two-years-ask-still-trips",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "We are looking for a senior developer with 2 years of experience in Angular.",
        "2026-09-10",
    ),
    (
        "senior-title-tolerates-three-years",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "We are looking for a senior developer with 3 years of experience in Angular and TypeScript.",
        "2026-09-10",
    ),
    (
        "company-anniversary-is-not-an-experience-ask",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "100 Jahre Firmengeschichte. Wir suchen Angular und TypeScript Erfahrung.",
        "2026-09-10",
    ),
    (
        "range-floor-decides-two-to-four",
        "Angular Developer",
        "Acme",
        "Remote",
        "Buscamos 2-4 anos de experiencia con Angular y TypeScript.",
        "2026-09-10",
    ),
    (
        "range-floor-decides-six-to-eight",
        "Angular Developer",
        "Acme",
        "Remote",
        "Buscamos 6-8 anos de experiencia con Angular y TypeScript.",
        "2026-09-10",
    ),
    (
        "soft-cue-suppresses-the-years-ask",
        "Angular Developer",
        "Acme",
        "Remote",
        "Mentoring for junior colleagues, but you need 2 years of experience with Angular.",
        "2026-09-10",
    ),
    (
        "dotnet-title-is-strictly-outside",
        ".NET Full-stack Developer",
        "Acme",
        "Remote",
        "C#, .NET, TypeScript, Angular, Azure. Full-stack role.",
        "2026-09-10",
    ),
    (
        "dotnet-body-is-lenient-when-ts-is-present",
        "Full-stack Developer",
        "Acme",
        "Remote",
        "You will work with Angular and TypeScript, and integrate with .NET services.",
        "2026-09-10",
    ),
    (
        "java-only-backend",
        "Senior Backend Developer",
        "Acme",
        "Remote",
        "Java, Spring Boot, Kafka, microservices. No frontend work.",
        "2026-09-10",
    ),
    (
        "golang-backend",
        "Senior Software Engineer (Golang)",
        "Acme",
        "Remote",
        "Go, Kubernetes, gRPC. Distributed systems.",
        "2026-09-10",
    ),
    (
        "rails-title",
        "Tech Lead Rails",
        "Acme",
        "Remote",
        "Ruby on Rails, PostgreSQL. Leadership of a small team.",
        "2026-09-10",
    ),
    (
        "data-scientist",
        "Data Scientist",
        "Acme",
        "Remote",
        "Python, pandas, scikit-learn, SQL.",
        "2026-09-10",
    ),
    (
        "engineering-manager",
        "Engineering Manager",
        "Acme",
        "Remote",
        "Lead a team of eight engineers. People management and roadmap.",
        "2026-09-10",
    ),
    (
        "ios-primary",
        "Senior iOS Engineer",
        "Acme",
        "Remote",
        "Swift, SwiftUI, iOS platform work.",
        "2026-09-10",
    ),
    (
        "ios-title-cleared-by-web-stack-in-title",
        "Senior iOS and Angular Developer",
        "Acme",
        "Remote",
        "Swift for the mobile app, Angular and TypeScript for the web client.",
        "2026-09-10",
    ),
    (
        "no-sponsorship",
        "Senior Angular Developer",
        "Acme",
        "Berlin",
        "Angular and TypeScript. We are unable to sponsor visas for this position.",
        "2026-09-10",
    ),
    (
        "residency-or-clearance",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "Angular and TypeScript. Security clearance required. Must be a resident.",
        "2026-09-10",
    ),
    (
        "onsite-abroad-with-no-relocation",
        "Senior Angular Developer",
        "Acme",
        "Munich",
        "Angular and TypeScript. This role requires on-site presence in our Munich office.",
        "2026-09-10",
    ),
    (
        "onsite-cleared-by-remote",
        "Senior Angular Developer",
        "Acme",
        "Munich",
        "Angular and TypeScript. On-site presence possible, but the role is fully remote.",
        "2026-09-10",
    ),
    (
        "relocation-offered-adds-a-signal",
        "Senior Angular Developer",
        "Acme",
        "Amsterdam",
        "Angular and TypeScript. We offer relocation support and visa sponsorship.",
        "2026-09-10",
    ),
    (
        "body-stack-is-capped",
        "Senior Software Engineer",
        "Acme",
        "Remote",
        "Angular, TypeScript, NestJS, Node.js, RxJS, NgRx, Stencil.js, Web Components, "
        "Microfrontends, single-spa, PrimeNG, Angular Material, PostgreSQL, TypeORM, Docker, "
        "AWS, Splunk, Jenkins, GitLab CI/CD, Azure DevOps, Ionic, Jest, Jasmine, Karma.",
        "2026-09-10",
    ),
    (
        "title-decides-over-a-body-pile",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "Angular and TypeScript. Nice to have: Docker, AWS, Splunk, Jenkins, PostgreSQL.",
        "2026-09-10",
    ),
    (
        "body-pile-without-a-title-signal",
        "Senior Software Engineer",
        "Acme",
        "Remote",
        "Docker, AWS, Splunk, Jenkins, PostgreSQL, TypeORM, Ionic.",
        "2026-09-10",
    ),
    (
        "pipe-in-title",
        "Desarrollador/a Fullstack | React.js + NestJS/Node.js",
        "Acme",
        "Chile",
        "NestJS, Node.js y TypeScript. React en el frontend, transferible.",
        "2026-09-10",
    ),
    (
        "index-row-without-description",
        "Senior Angular Developer",
        "Acme",
        "Chile",
        "",
        "2026-09-10",
    ),
    (
        "fresh-this-month-adds-a-signal",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "Angular y TypeScript.",
        "2026-09-21",
    ),
    (
        "old-posting-loses-the-fresh-signal",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "Angular y TypeScript.",
        "2026-05-01",
    ),
    (
        "react-is-transferable",
        "Frontend Developer",
        "Acme",
        "Remote",
        "React, TypeScript y Next.js.",
        "2026-09-10",
    ),
    (
        "nixos-counts-as-personal-project",
        "Senior Angular Developer",
        "Acme",
        "Remote",
        "Angular, TypeScript y NixOS para el entorno de desarrollo.",
        "2026-09-10",
    ),
    (
        "empty-title",
        "",
        "Acme",
        "Remote",
        "Angular y TypeScript.",
        "2026-09-10",
    ),
    (
        "spanish-language-is-not-a-disqualifier",
        "Desarrollador Senior Angular",
        "Acme",
        "Santiago, Chile",
        "Buscamos desarrollador senior con Angular y TypeScript. Se requiere espanol nativo.",
        "2026-09-10",
    ),
]


def build_vacancy(row: dict, index: int) -> ranker.Vacancy:
    """Arma una `Vacancy` del ranker desde una fila cruda del feed."""
    return ranker.Vacancy(
        source=str(row.get("source") or "fixture"),
        id=str(row.get("id") or f"fixture-{index}"),
        title=str(row.get("title") or ""),
        company=row.get("company"),
        location=row.get("location"),
        date=row.get("date"),
        url=str(row.get("url") or ""),
        description=str(row.get("description") or ""),
        salary=row.get("salary"),
    )


def truncate(text: str, limit: int) -> str:
    if limit <= 0 or len(text) <= limit:
        return text
    return text[:limit]


def case_from(
    name: str,
    title: str,
    company: str | None,
    location: str | None,
    description: str,
    date: str | None,
    weights: dict[str, float],
    max_desc: int,
) -> dict:
    description = truncate(description or "", max_desc)
    vacancy = ranker.Vacancy(
        source="fixture",
        id=name,
        title=title,
        company=company,
        location=location,
        date=date,
        url="",
        description=description,
    )
    score, matched, in_title, signals = ranker.score_vacancy(vacancy, weights, TODAY)
    return {
        "name": name,
        "input": {
            "title": title,
            "company": company,
            "location": location,
            "description": description,
            "date": date,
        },
        "expected": {
            "score": score,
            "matchedSkills": matched,
            "titleSkills": in_title,
            "primaryMatches": sum(1 for skill in matched if weights[skill] >= ranker.PRIMARY_WEIGHT),
            "signals": signals,
            "disqualifiers": ranker.disqualified(vacancy),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True, help="JSON exportado por el backend")
    parser.add_argument("--corpus", help="JSON con vacantes crudas del feed")
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-desc-chars", type=int, default=600)
    parser.add_argument("--corpus-limit", type=int, default=0)
    args = parser.parse_args()

    profile_raw = Path(args.profile).read_text(encoding="utf-8")
    profile = json.loads(profile_raw)
    weights = ranker.skill_weights(profile)

    cases = [
        case_from(name, title, company, location, description, date, weights, args.max_desc_chars)
        for name, title, company, location, description, date in SYNTHETIC
    ]

    corpus_count = 0
    if args.corpus:
        payload = json.loads(Path(args.corpus).read_text(encoding="utf-8"))
        rows = payload if isinstance(payload, list) else payload.get("results", [])
        if args.corpus_limit:
            rows = rows[: args.corpus_limit]
        for index, row in enumerate(rows):
            vacancy = build_vacancy(row, index)
            name = f"corpus-{index:03d}"
            cases.append(
                case_from(
                    name,
                    vacancy.title,
                    vacancy.company,
                    vacancy.location,
                    vacancy.description,
                    vacancy.date,
                    weights,
                    args.max_desc_chars,
                )
            )
            corpus_count += 1

    fixture = {
        "note": "Generado por tools/generate_scoring_golden.py desde el Python real. No editar a mano.",
        "today": TODAY.isoformat(),
        "profile_sha256": hashlib.sha256(profile_raw.encode("utf-8")).hexdigest(),
        "case_count": len(cases),
        "synthetic_count": len(SYNTHETIC),
        "corpus_count": corpus_count,
        "cases": cases,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"escrito {out} ({out.stat().st_size} bytes)")
    print(f"casos: {len(cases)} (sinteticos {len(SYNTHETIC)}, corpus {corpus_count})")
    print(f"skills con peso: {len(weights)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

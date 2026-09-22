#!/usr/bin/env python3
"""Trae las pegas vivas de la API publica de pegas.devschile.cl.

El portal es `devschile/pegas` (Nuxt sobre Postgres) y expone su propio listado
sin auth: /api/pegas acepta q, categoria, fuente, conSueldo, pagina y porPagina
(tope 50), y /api/meta devuelve el universo y las fuentes.

La salida usa el MISMO formato JSON que produce el CLI, para que
rank_live_vacancies.py lo consuma sin cambios:

    {"meta": {"source": ...}, "results": [{id, title, company, location,
     date, url, description, salary, category}]}

Dos cosas de la API que obligan a este script a existir:

- `descripcion` son ~59 chars de "titulo, ubicacion", igual en el listado y en
  el detalle. La API es un indice de descubrimiento, no un corpus: sin
  --enrich, lo unico que el ranker puede leer es el titulo.
- La busqueda `q` pega contra `titulo || empleador || descripcion || categoria`,
  y como la descripcion no existe, en la practica busca en el titulo. Eso la
  vuelve util (46 pegas dicen "Angular" en el titulo) pero no completa.

Con --enrich se sigue la `url` de cada pega y se baja la descripcion real de la
fuente original, acotada al contenedor del aviso (LinkedIn lo trae entero en uno
solo, getonbrd lo parte en varios). Acotarla no es cosmetico: con la pagina
entera, "Accessibility" matcheaba el link del footer de LinkedIn en el 100% de
sus filas y le regalaba un punto a cada una. Una fuente sin contenedor mapeado
cae a la pagina entera y se cuenta aparte, en vez de dar por hecho que vino
limpia.

Uso:
    python3 tools/fetch_pegas_devschile.py                        # todo, sin descripciones
    python3 tools/fetch_pegas_devschile.py --query angular,nestjs --enrich
    python3 tools/fetch_pegas_devschile.py --categoria "Full Stack" --enrich
    python3 tools/rank_live_vacancies.py --input '/tmp/vac/pegas-devschile.json'
"""
from __future__ import annotations

import argparse
import html as html_module
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

API_BASE = "https://pegas.devschile.cl/api"
DEFAULT_OUTPUT = "/tmp/vac/pegas-devschile.json"
CACHE_DIR = Path("/tmp/pegas-api/pages")

# La API responde 403 al User-Agent por defecto de Python y corta la conexion
# (SSL EOF) si se la consulta en rafaga. UA de navegador, pausa y reintentos.
BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/153.0 Safari/537.36"
)
PER_PAGE = 50
EMPTY_EMPLOYER = {"no especificado", "no especificada", "", "n/a", "-"}
DEFAULT_DELAY = 1.0
DESCRIPTION_MAX = 12000

_STRIP_BLOCKS = re.compile(
    r"<(script|style|noscript|svg|template)\b.*?</\1>", re.S | re.IGNORECASE
)
_TAGS = re.compile(r"<[^>]+>")
_COMMENTS = re.compile(r"<!--.*?-->", re.S)
_WHITESPACE = re.compile(r"\s+")


VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img",
    "input", "link", "meta", "param", "source", "track", "wbr",
}

# El cuerpo de la pega, por fuente. Sin acotarlo entra el pie de pagina, y
# "Accessibility" (una skill real del perfil) matchea el link "Accessibility" del
# footer de LinkedIn: aparecia en 31 de 31 filas de LinkedIn y en 2 de 19 de
# getonbrd, donde si era contenido. Un flag que se dispara siempre no informa y
# encima regala un punto por fila.
# LinkedIn trae el aviso en un solo contenedor; getonbrd lo parte en varios
# (descripcion, requisitos), por eso el segundo valor dice si hay que juntarlos.
JD_CONTAINER: dict[str, tuple[str, bool]] = {
    "linkedin.com": ("description__text", False),
    "getonbrd.com": ("gb-rich-txt", True),
}


def container_for(url: str | None) -> tuple[str, bool] | None:
    if not url:
        return None
    host = urllib.parse.urlparse(url).netloc.lower()
    for domain, spec in JD_CONTAINER.items():
        if host == domain or host.endswith(f".{domain}"):
            return spec
    return None


class _SubtreeText(HTMLParser):
    """El texto de cada elemento cuya lista de clases incluya `wanted`.

    Arma el texto de abajo hacia arriba: al cerrar un elemento, su texto se
    agrega al del padre. Un documento con etiquetas sin cerrar desalinea la pila,
    pero el texto igual queda dentro del ancestro, asi que degrada en vez de
    romper.
    """

    def __init__(self, wanted: str) -> None:
        super().__init__(convert_charrefs=True)
        self.wanted = wanted
        self._stack: list[tuple[list[str], list[str]]] = []
        self.matches: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in VOID_TAGS:
            return
        classes = (dict(attrs).get("class") or "").split()
        self._stack.append((classes, []))

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID_TAGS or not self._stack:
            return
        classes, chunks = self._stack.pop()
        text = _WHITESPACE.sub(" ", " ".join(chunks)).strip()
        if self.wanted in classes and text:
            self.matches.append(text)
        if self._stack:
            self._stack[-1][1].append(text)

    def handle_data(self, data: str) -> None:
        if self._stack:
            self._stack[-1][1].append(data)


def _page_text(markup: str) -> str:
    """Todo el texto de la pagina, sin script/style/comentarios. Es el fallback
    cuando no hay contenedor conocido o cuando el contenedor no aparece."""
    text = _COMMENTS.sub(" ", markup)
    text = _STRIP_BLOCKS.sub(" ", text)
    text = _TAGS.sub(" ", text)
    return _WHITESPACE.sub(" ", html_module.unescape(text)).strip()


def jd_text(
    markup: str, url: str | None = None, max_chars: int = DESCRIPTION_MAX
) -> tuple[str, bool]:
    """(texto de la pega, si se pudo acotar al cuerpo).

    Devuelve el texto del contenedor de la fuente cuando existe y, si no, la
    pagina entera con False. Ese segundo valor es para poder reportar cuantas
    filas se decidieron sobre texto sin acotar en vez de dar por hecho que todas
    vienen limpias.
    """
    if not markup:
        return "", False
    spec = container_for(url)
    if spec:
        wanted, all_matches = spec
        parser = _SubtreeText(wanted)
        parser.feed(markup)
        if parser.matches:
            chosen = parser.matches if all_matches else parser.matches[:1]
            return _WHITESPACE.sub(" ", " ".join(chosen)).strip()[:max_chars], True
    return _page_text(markup)[:max_chars], False


def extract_text(markup: str, url: str | None = None, max_chars: int = DESCRIPTION_MAX) -> str:
    """Texto plano de una pagina de pega, acotado al cuerpo cuando se reconoce la
    fuente. Sin `url` devuelve la pagina entera, que es lo que sirve para una
    fuente nueva que todavia no tiene contenedor mapeado."""
    return jd_text(markup, url, max_chars)[0]


def parse_api_row(pega: dict) -> dict | None:
    """Una fila de la API a la forma que espera el ranker.

    Devuelve None si la fila no sirve: el ranker descarta en silencio las que no
    tienen titulo o url, y contarlas aca hace visible la perdida.
    """
    title = (pega.get("titulo") or "").strip()
    url = (pega.get("url") or "").strip()
    if not title or not url:
        return None

    employer = (pega.get("empleador") or "").strip()
    published = (pega.get("fecha_publicacion") or "").strip()

    return {
        "id": str(pega.get("id") or url),
        "title": title,
        "company": None if employer.lower() in EMPTY_EMPLOYER else employer,
        "companyUrl": None,
        "location": (pega.get("ubicacion") or "").strip() or None,
        # El ranker compara contra fechas YYYY-MM-DD; la API manda ISO completo.
        "date": published[:10] or None,
        "deadline": None,
        "url": url,
        "description": "",
        "salary": (pega.get("sueldo") or "").strip() or None,
        "category": (pega.get("categoria") or "").strip() or None,
        "portal_source": (pega.get("fuente") or "").strip() or None,
    }


def request(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(
        url, headers={"User-Agent": BROWSER_UA, "Accept": "*/*"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def api_get(path: str, attempts: int = 4, **params) -> dict:
    url = f"{API_BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return json.loads(request(url))
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"la API fallo en {url} tras {attempts} intentos: {last}")


def fetch_meta() -> dict:
    return api_get("meta")


def fetch_index(
    query: str | None = None,
    categoria: str | None = None,
    fuente: str | None = None,
    con_sueldo: bool = False,
    limit: int | None = None,
    delay: float = DEFAULT_DELAY,
    verbose: bool = True,
) -> tuple[list[dict], int]:
    """Recorre la paginacion y devuelve (filas, total que declara la API).

    `limit` corta la traida para poder probar sin bajar el universo entero.
    """
    params: dict[str, object] = {"porPagina": PER_PAGE}
    if query:
        params["q"] = query
    if categoria:
        params["categoria"] = categoria
    if fuente:
        params["fuente"] = fuente
    if con_sueldo:
        params["conSueldo"] = 1

    first = api_get("pegas", **params)
    total = int(first.get("total") or 0)
    rows = list(first.get("pegas") or [])
    page = 2
    while len(rows) < total and (limit is None or len(rows) < limit):
        if delay:
            time.sleep(delay)
        chunk = api_get("pegas", **dict(params, pagina=page))
        batch = chunk.get("pegas") or []
        if not batch:
            break
        rows.extend(batch)
        page += 1
        if verbose:
            print(f"  pagina {page - 1}: {len(rows)}/{total}", file=sys.stderr)

    if limit is not None:
        rows = rows[:limit]
    return rows, total


def enrich(rows: list[dict], limit: int, delay: float, refresh: bool, verbose: bool = True) -> dict:
    """Baja la descripcion real de cada pega desde su url.

    Cachea el HTML en disco: la misma pega no se baja dos veces, y una corrida
    repetida no vuelve a golpear a la fuente. Los fallos se cuentan, no cortan.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stats = {"attempted": 0, "enriched": 0, "failed": 0, "cached": 0, "empty": 0,
             "scoped": 0, "unscoped": 0}

    for row in rows:
        if stats["attempted"] >= limit:
            break
        url = row["url"]
        stats["attempted"] += 1
        cache_file = CACHE_DIR / f"{row['id']}.html"

        markup = ""
        if cache_file.exists() and not refresh:
            markup = cache_file.read_text(encoding="utf-8", errors="ignore")
            stats["cached"] += 1
        else:
            if delay:
                time.sleep(delay)
            try:
                markup = request(url, timeout=25).decode("utf-8", errors="ignore")
                cache_file.write_text(markup, encoding="utf-8")
            except Exception as exc:  # noqa: BLE001 - una fuente caida no corta la corrida
                stats["failed"] += 1
                if verbose:
                    print(f"  sin descripcion: {row['id']} ({type(exc).__name__})", file=sys.stderr)
                continue

        text, scoped = jd_text(markup, url)
        if not text:
            stats["empty"] += 1
            continue
        row["description"] = text
        stats["enriched"] += 1
        stats["scoped" if scoped else "unscoped"] += 1
        if verbose:
            mark = "" if scoped else " [pagina entera]"
            print(f"  {stats['enriched']}: {row['title'][:50]} ({len(text)} chars){mark}", file=sys.stderr)

    return stats


def build_payload(rows: list[dict], meta: dict, skipped: int) -> dict:
    """El JSON que consume el ranker. `meta.source` es lo unico que el ranker lee
    de meta; el resto queda para poder auditar de donde salio cada numero."""
    return {
        "meta": {
            "source": "pegas-devschile",
            "total": len(rows),
            "portal": "https://pegas.devschile.cl",
            "repository": "https://github.com/devschile/pegas",
            "universe": meta.get("total"),
            "updated": meta.get("actualizado"),
            "skipped_incomplete": skipped,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
        "results": rows,
    }


def dedupe_rows(rows: list[dict]) -> tuple[list[dict], int]:
    """Una pega puede salir en dos busquedas (una de Angular puede nombrar NestJS
    en el titulo). El ranker deduplica igual por url, pero contar dos veces infla
    el universo que se reporta."""
    seen: set[str] = set()
    unique: list[dict] = []
    for row in rows:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        unique.append(row)
    return unique, len(rows) - len(unique)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--query", help="terminos separados por coma; la API los busca uno por uno y se unen")
    parser.add_argument("--categoria", help="una de las 13 del portal (ej. 'Full Stack')")
    parser.add_argument("--fuente", help="getonbrd, linkedin, workingnomads, jobicy, himalayas")
    parser.add_argument("--con-sueldo", action="store_true", help="solo pegas con sueldo publicado")
    parser.add_argument("--limit", type=int, help="corta la traida (para probar sin bajar todo)")
    parser.add_argument("--enrich", action="store_true", help="baja la descripcion real de cada pega")
    parser.add_argument("--enrich-limit", type=int, default=60, help="tope de descargas al enriquecer (default 60)")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="segundos entre requests (default 1.0)")
    parser.add_argument("--refresh", action="store_true", help="ignora el cache de paginas")
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    meta = fetch_meta()
    print(
        f"universo: {meta.get('total')} pegas | actualizado {meta.get('actualizado')}",
        file=sys.stderr,
    )

    rows: list[dict] = []
    skipped = 0
    if args.query:
        for term in [t.strip() for t in args.query.split(",") if t.strip()]:
            found, total = fetch_index(
                query=term, categoria=args.categoria, fuente=args.fuente,
                con_sueldo=args.con_sueldo, limit=args.limit, delay=args.delay,
            )
            print(f"q={term}: {total} declaradas, {len(found)} traidas", file=sys.stderr)
            for pega in found:
                row = parse_api_row(pega)
                if row is None:
                    skipped += 1
                    continue
                rows.append(row)
    else:
        found, total = fetch_index(
            categoria=args.categoria, fuente=args.fuente,
            con_sueldo=args.con_sueldo, limit=args.limit, delay=args.delay,
        )
        print(f"sin filtro: {total} declaradas, {len(found)} traidas", file=sys.stderr)
        for pega in found:
            row = parse_api_row(pega)
            if row is None:
                skipped += 1
                continue
            rows.append(row)

    unique, repeated = dedupe_rows(rows)
    print(f"filas: {len(rows)} -> {len(unique)} unicas ({repeated} repetidas)", file=sys.stderr)

    if args.enrich:
        print(f"enriqueciendo hasta {args.enrich_limit} pegas...", file=sys.stderr)
        stats = enrich(unique, args.enrich_limit, args.delay, args.refresh)
        print(f"enriquecidas: {stats['enriched']} | desde cache: {stats['cached']} | "
              f"sin respuesta: {stats['failed']} | vacias: {stats['empty']}", file=sys.stderr)
        print(f"acotadas al cuerpo de la pega: {stats['scoped']} | sobre la pagina entera: "
              f"{stats['unscoped']}", file=sys.stderr)

    payload = build_payload(unique, meta, skipped)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"escrito {output} ({output.stat().st_size} bytes)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

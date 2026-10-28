#!/usr/bin/env python3
"""Assemble each design template with the shared form and i18n script.

Usage: python3 tools/build.py [--artifact-dir DIR]
Writes designs/<name>/index.html (full page). With --artifact-dir also writes
<name>.html fragments (no doctype/head) for publishing as artifacts.
"""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent
repo = root.parent
form = (root / "common/form.html").read_text()
script = "<script>\n" + (root / "common/i18n.js").read_text() + "</script>"
art = sys.argv[sys.argv.index("--artifact-dir") + 1] if "--artifact-dir" in sys.argv else None
for tpl in sorted((root / "designs").glob("*.html")):
    head, body = tpl.read_text().split("<!--BODY-->")
    body = body.replace("{{FORM}}", form).replace("{{SCRIPT}}", script)
    full = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + head + "</head>\n<body>" + body + "</body>\n</html>\n")
    out = repo / "designs" / tpl.stem / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(full)
    if art:
        pathlib.Path(art).mkdir(parents=True, exist_ok=True)
        (pathlib.Path(art) / f"{tpl.stem}.html").write_text(head + body)

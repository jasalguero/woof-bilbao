#!/usr/bin/env python3
"""Assemble each design template with the shared form and i18n script.

Usage: python3 tools/build.py [--artifact-dir DIR]
Writes designs/<name>/index.html (full page). With --artifact-dir also writes
<name>.html fragments (no doctype/head) for publishing as artifacts.

Environment (optional):
  WOOF_BOOKING_URL         URL of the submit-booking Edge Function. Unset = the form
                           stays a mock-up that sends nothing.
  WOOF_TURNSTILE_SITE_KEY  Cloudflare Turnstile site key for the anti-spam widget.
"""
import os, pathlib, re, sys
from illustrations import SCENES
root = pathlib.Path(__file__).resolve().parent
repo = root.parent
form = (root / "common/form.html").read_text()
booking_url = os.environ.get("WOOF_BOOKING_URL", "")
site_key = os.environ.get("WOOF_TURNSTILE_SITE_KEY", "")
turnstile = ('<div class="cf-turnstile" data-sitekey="%s"></div>\n'
             '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' % site_key) if site_key else ""
form = form.replace("{{TURNSTILE}}", turnstile)
script = "<script>\n" + (root / "common/i18n.js").read_text().replace("{{BOOKING_URL}}", booking_url) + "</script>"
illus = (root / "common/illus.css").read_text()
art = sys.argv[sys.argv.index("--artifact-dir") + 1] if "--artifact-dir" in sys.argv else None
for tpl in sorted((root / "designs").glob("*.html")):
    head, body = tpl.read_text().split("<!--BODY-->")
    head = head.replace("</style>", illus + "</style>", 1)
    body = body.replace("{{FORM}}", form).replace("{{SCRIPT}}", script)
    body = re.sub(r"\{\{IMG:(\w+)\}\}", lambda m: SCENES[m.group(1)], body)
    full = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + head + "</head>\n<body>" + body + "</body>\n</html>\n")
    out = repo / "designs" / tpl.stem / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(full)
    if art:
        pathlib.Path(art).mkdir(parents=True, exist_ok=True)
        (pathlib.Path(art) / f"{tpl.stem}.html").write_text(head + body)

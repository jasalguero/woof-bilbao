#!/usr/bin/env python3
"""Assemble each design template with the shared form and i18n script.

Usage: python3 tools/build.py [--artifact-dir DIR]
Writes designs/<name>/index.html (full page). With --artifact-dir also writes
<name>.html fragments (no doctype/head) for publishing as artifacts.

Environment (optional):
  WOOF_BOOKING_URL         URL of the submit-booking Edge Function. Unset = the form
                           stays a mock-up that sends nothing.
  WOOF_TURNSTILE_SITE_KEY  Cloudflare Turnstile site key for the anti-spam widget.
  WOOF_PRICES_URL          URL of the public-prices Edge Function. The page fetches the
                           current prices from it when it loads, so the site stays static
                           and always shows what Settings → Prices says in the staff app.
                           Defaults to the public-prices function next to WOOF_BOOKING_URL.
                           Unset (and no booking URL) = the page shows the default prices
                           baked into i18n.js (mock-up mode).
"""
import os, pathlib, re, sys
from illustrations import SCENES
root = pathlib.Path(__file__).resolve().parent
repo = root.parent
form = (root / "common/form.html").read_text()
booking_url = os.environ.get("WOOF_BOOKING_URL", "")
prices_url = os.environ.get("WOOF_PRICES_URL", "")
if not prices_url and booking_url.endswith("/submit-booking"):
    prices_url = booking_url[: -len("submit-booking")] + "public-prices"
site_key = os.environ.get("WOOF_TURNSTILE_SITE_KEY", "")
turnstile = ('<div class="cf-turnstile" data-sitekey="%s"></div>\n'
             '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' % site_key) if site_key else ""
form = form.replace("{{TURNSTILE}}", turnstile)
script = ("<script>\n" + (root / "common/i18n.js").read_text()
          .replace("{{BOOKING_URL}}", booking_url).replace("{{PRICES_URL}}", prices_url) + "</script>")
prices = (root / "common/prices.html").read_text()
illus = (root / "common/illus.css").read_text() + (root / "common/prices.css").read_text()
art = sys.argv[sys.argv.index("--artifact-dir") + 1] if "--artifact-dir" in sys.argv else None
for tpl in sorted((root / "designs").glob("*.html")):
    head, body = tpl.read_text().split("<!--BODY-->")
    head = head.replace("</style>", illus + "</style>", 1)
    body = body.replace("{{FORM}}", form).replace("{{PRICES}}", prices).replace("{{SCRIPT}}", script)
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

"""Inline SVG illustrations shared by the designs.

Shapes carry role classes (.fur1, .sky, .water…) coloured by --il-* tokens in
illus.css, so each design can tint the same pictures. Outlined shapes get .o.
"""

def dog(x, y, s=1, fur="fur1", ear="floppy", spot=True, flip=False, tongue=True, collar="collar"):
    f = -1 if flip else 1
    ears = (f'<ellipse class="o fur2" cx="26" cy="-80" rx="9" ry="17" transform="rotate(25 26 -80)"/>' if ear == "floppy"
            else f'<path class="o {fur}" d="M24 -88 L30 -112 L44 -92 Z"/>')
    return (f'<g transform="translate({x} {y}) scale({s * f} {s})">'
            f'<path class="o tail {fur}" d="M-38 -46 C-58 -58 -62 -80 -50 -92" fill="none"/>'
            + "".join(f'<rect class="o {fur}" x="{lx}" y="-24" width="13" height="26" rx="6"/>' for lx in (-34, -16, 10, 26))
            + f'<ellipse class="o {fur}" cx="0" cy="-40" rx="44" ry="26"/>'
            + (f'<ellipse class="fur2" cx="-12" cy="-46" rx="14" ry="10"/>' if spot else "")
            + f'<rect class="o {collar}" x="18" y="-60" width="14" height="22" rx="4" transform="rotate(-20 25 -49)"/>'
            f'<circle class="o {fur}" cx="38" cy="-74" r="24"/>'
            f'<ellipse class="o light" cx="57" cy="-65" rx="15" ry="11"/>'
            + (f'<path class="o pink" d="M56 -56 q4 12 10 0 z"/>' if tongue else "")
            + f'<ellipse class="dark" cx="70" cy="-70" rx="5.5" ry="4.5"/>'
            f'<circle class="dark" cx="44" cy="-80" r="4"/><circle class="white" cx="45.5" cy="-81.5" r="1.4"/>'
            f'<circle class="blush" cx="48" cy="-66" r="5"/>' + ears + "</g>")


def face(x, y, s=1, fur="fur1", ear="floppy", bow=False, patch=False):
    if ear == "floppy":
        ears = ('<ellipse class="o fur2" cx="-62" cy="-10" rx="22" ry="44" transform="rotate(18 -62 -10)"/>'
                '<ellipse class="o fur2" cx="62" cy="-10" rx="22" ry="44" transform="rotate(-18 62 -10)"/>')
    else:
        ears = (f'<path class="o {fur}" d="M-70 -30 L-58 -100 L-20 -58 Z"/><path class="o {fur}" d="M70 -30 L58 -100 L20 -58 Z"/>'
                '<path class="pink" d="M-60 -44 L-56 -82 L-34 -58 Z"/><path class="pink" d="M60 -44 L56 -82 L34 -58 Z"/>')
    return (f'<g transform="translate({x} {y}) scale({s})">'
            f'<ellipse class="o {fur}" cx="0" cy="120" rx="80" ry="70"/>'
            f'<ellipse class="light" cx="0" cy="130" rx="40" ry="46"/>'
            + ears
            + f'<ellipse class="o {fur}" cx="0" cy="0" rx="72" ry="66"/>'
            + ('<ellipse class="fur2" cx="-30" cy="-20" rx="24" ry="22"/>' if patch else "")
            + '<ellipse class="o light" cx="0" cy="28" rx="34" ry="26"/>'
            '<ellipse class="dark" cx="0" cy="14" rx="11" ry="8"/>'
            '<path class="o line" d="M-12 32 q12 10 12 -6 q0 16 12 6" fill="none"/>'
            '<path class="o pink" d="M-7 38 q7 20 14 0 z"/>'
            '<circle class="dark" cx="-28" cy="-12" r="9"/><circle class="dark" cx="28" cy="-12" r="9"/>'
            '<circle class="white" cx="-25" cy="-15" r="3"/><circle class="white" cx="31" cy="-15" r="3"/>'
            '<circle class="blush" cx="-44" cy="16" r="10"/><circle class="blush" cx="44" cy="16" r="10"/>'
            '<rect class="o collar" x="-48" y="58" width="96" height="16" rx="8"/><circle class="o tag" cx="0" cy="82" r="10"/>'
            + ('<g transform="translate(46 -56) rotate(20)"><path class="o bow" d="M0 0 L-24 -14 L-24 14 Z"/><path class="o bow" d="M0 0 L24 -14 L24 14 Z"/><circle class="o bow" r="7"/></g>' if bow else "")
            + "</g>")


def svg(view, label, body):
    return f'<svg class="il" viewBox="{view}" role="img" aria-label="{label}" preserveAspectRatio="xMidYMid slice">{body}</svg>'


def hills(w, h):
    return (f'<rect class="sky" width="{w}" height="{h}"/>'
            f'<circle class="sun" cx="{w*0.82}" cy="{h*0.2}" r="{h*0.1}"/>'
            f'<path class="hill2" d="M0 {h*0.55} Q{w*0.2} {h*0.3} {w*0.45} {h*0.5} T{w} {h*0.42} V{h} H0Z"/>'
            f'<path class="hill1" d="M0 {h*0.62} Q{w*0.3} {h*0.45} {w*0.6} {h*0.6} T{w} {h*0.58} V{h} H0Z"/>')


def river(w, y, h):
    waves = "".join(f'<path class="wave" d="M{x} {y + h*0.4} q15 -8 30 0" fill="none"/>' for x in range(20, w, 90))
    return f'<rect class="water" y="{y}" width="{w}" height="{h}"/>' + waves


def ball(x, y, r=14):
    return f'<circle class="o ball" cx="{x}" cy="{y}" r="{r}"/><path class="o line" d="M{x-r} {y} q{r} -{r*0.8} {2*r} 0" fill="none"/>'


def bridge(w, y, x0=0):
    # White arched footbridge, a nod to Bilbao's Zubizuri
    return (f'<path class="bridge arch" d="M{x0+w*0.08} {y} Q{x0+w*0.32} {y-70} {x0+w*0.56} {y}" fill="none" stroke-width="7"/>'
            + "".join(f'<line class="bridge" x1="{x0+w*(0.08+i*0.048)}" y1="{y}" x2="{x0+w*0.32}" y2="{y-70}" stroke-width="2"/>' for i in range(1, 10))
            + f'<rect class="bridge" x="{x0+w*0.06}" y="{y}" width="{w*0.52}" height="6"/>')


def ground(w, y, h):
    return f'<rect class="ground" y="{y}" width="{w}" height="{h}"/>'


def guggenheim(x, y, s=1):
    # Titanium curves of the Guggenheim on the riverbank, base at y
    petals = [("ti1", "M0 0 C10 -60 60 -92 112 -72 C84 -44 72 -22 82 0 Z"),
              ("ti3", "M150 -96 C158 -138 176 -150 190 -132 C182 -116 180 -104 178 -96 Z"),
              ("ti2", "M60 0 C70 -82 130 -124 176 -102 C152 -64 150 -30 162 0 Z"),
              ("ti1", "M132 0 C150 -72 204 -94 246 -62 C222 -42 220 -20 232 0 Z"),
              ("ti3", "M196 0 C214 -40 262 -52 304 -30 L304 0 Z")]
    seams = "".join(f'<path class="seam" d="M{a} 0 C{a+12} -{h} {a+40} -{h+18} {a+70} -{h+10}" fill="none"/>'
                    for a, h in ((20, 40), (84, 60), (150, 40), (214, 22)))
    return (f'<g transform="translate({x} {y}) scale({s})">'
            '<rect class="o glass" x="30" y="-64" width="54" height="64"/>'
            + "".join(f'<path class="o {c}" d="{d}"/>' for c, d in petals) + seams + "</g>")


def puppy(x, y, s=1):
    # Jeff Koons' Puppy: a sitting terrier covered in flowers
    import math, random
    rnd = random.Random(7)
    head = (0, -178, 44)
    def inside(px, py):
        if (px - head[0]) ** 2 + (py - head[1]) ** 2 < head[2] ** 2: return True
        if -150 < py < 0:
            half = 34 + (py + 150) * 0.36
            return abs(px) < half
        return False
    flowers = []
    for _ in range(260):
        px, py = rnd.uniform(-90, 90), rnd.uniform(-222, 0)
        if inside(px, py):
            flowers.append(f'<circle class="fl{rnd.randint(1, 5)}" cx="{px:.0f}" cy="{py:.0f}" r="{rnd.uniform(5, 9):.1f}"/>')
    return (f'<g transform="translate({x} {y}) scale({s})">'
            '<ellipse class="o puppy" cx="-40" cy="-196" rx="16" ry="30" transform="rotate(20 -40 -196)"/>'
            '<ellipse class="o puppy" cx="40" cy="-196" rx="16" ry="30" transform="rotate(-20 40 -196)"/>'
            '<path class="o puppy" d="M-34 -150 L34 -150 L88 0 L-88 0 Z"/><circle class="o puppy" cx="0" cy="-178" r="44"/>'
            + "".join(flowers) + '<circle class="dark" cx="-14" cy="-182" r="4"/><circle class="dark" cx="14" cy="-182" r="4"/>'
            '<ellipse class="dark" cx="0" cy="-164" rx="7" ry="5"/></g>')


def salve(x, y, w):
    # La Salve bridge with its red arches
    arcs = "".join(f'<path class="salve" d="M{x+i*w/5} {y-40} q{w/10} -38 {w/5} 0" fill="none" stroke-width="7"/>' for i in range(5))
    return f'<rect class="deck" x="{x}" y="{y-44}" width="{w}" height="10"/>' + arcs + "".join(
        f'<rect class="deck" x="{x+i*w/4-6}" y="{y-36}" width="12" height="36"/>' for i in (1, 2, 3))


def tower(x, y, h):
    return f'<path class="o tower" d="M{x} {y} V{y-h+30} Q{x+24} {y-h} {x+48} {y-h+30} V{y} Z"/>' + "".join(
        f'<line class="seam" x1="{x+6}" y1="{y-h+40+i*22}" x2="{x+42}" y2="{y-h+40+i*22}"/>' for i in range(int((h-50)/22)))


def funicular(x, y):
    return (f'<path class="track" d="M{x} {y} L{x+140} {y-90}" fill="none" stroke-width="4"/>'
            f'<g transform="translate({x+70} {y-45}) rotate(-33)"><rect class="o fun" x="-18" y="-14" width="36" height="20" rx="4"/>'
            '<rect class="glass" x="-12" y="-10" width="10" height="8"/><rect class="glass" x="2" y="-10" width="10" height="8"/></g>')


SCENES = {
    "hero": svg("0 0 800 560", "Perros jugando junto a la ría / Dogs playing by the river",
                hills(800, 560) + tower(700, 330, 210) + guggenheim(480, 330, 0.95) + bridge(800, 330) + river(800, 330, 70) + ground(800, 400, 160)
                + dog(170, 500, 1.3, "fur1", "floppy") + dog(600, 490, 1.15, "fur3", "pointy", spot=False, flip=True, collar="collar2")
                + dog(390, 540, 0.9, "fur4", "floppy", spot=False, collar="collar3") + ball(470, 470)),
    "about": svg("0 0 400 400", "Perro con su comida / Dog with its meal",
                 '<rect class="wall" width="400" height="400"/>' + ground(400, 300, 100)
                 + dog(150, 330, 1.25, "fur1") + '<path class="o bowl" d="M250 300 h90 l-12 34 h-66z"/>'
                 '<ellipse class="kibble" cx="295" cy="300" rx="40" ry="9"/>'),
    "arrival": svg("0 0 400 300", "Llegada / Arrival",
                   '<rect class="wall" width="400" height="300"/><rect class="o door" x="250" y="60" width="100" height="190" rx="8"/>'
                   '<circle class="dark" cx="335" cy="160" r="5"/>' + ground(400, 250, 50) + dog(140, 270, 1.05, "fur3", "pointy", spot=False, collar="collar2")),
    "walk": svg("0 0 400 300", "Paseo por la ría / River walk",
                hills(400, 300) + funicular(230, 160) + salve(40, 205, 220) + river(400, 190, 40) + ground(400, 230, 70) + dog(120, 270, 0.85, "fur1") + dog(290, 275, 0.8, "fur4", collar="collar3", spot=False)),
    "nap": svg("0 0 400 300", "Comida y siesta / Lunch and nap",
               '<rect class="wall" width="400" height="300"/>' + ground(400, 220, 80)
               + '<ellipse class="o cushion" cx="180" cy="250" rx="130" ry="30"/>'
               + dog(180, 260, 0.95, "fur1", tongue=False)
               + '<text class="zzz" x="290" y="110">z</text><text class="zzz" x="315" y="80" font-size="36">z</text><text class="zzz" x="340" y="50" font-size="46">Z</text>'
               + '<path class="o bowl" d="M310 240 h60 l-8 24 h-44z"/>'),
    "play": svg("0 0 400 300", "Juego / Playtime",
                hills(400, 300) + guggenheim(150, 215, 0.6) + puppy(340, 220, 0.45) + ground(400, 210, 90) + dog(110, 275, 0.85, "fur3", "pointy", spot=False, collar="collar2")
                + dog(300, 280, 0.9, "fur1", flip=True) + ball(205, 150, 16)),
    "polo": svg("0 0 400 400", "Polo", '<rect class="bg1" width="400" height="400"/>' + face(200, 190, 1.15, "fur1", "floppy", patch=True)),
    "daisy": svg("0 0 400 400", "Daisy", '<rect class="bg2" width="400" height="400"/>' + face(200, 195, 1.15, "fur3", "pointy", bow=True)),
    "skyline": '<svg class="il skyline" viewBox="0 0 1200 220" role="img" aria-label="Bilbao: Guggenheim, Puppy, La Salve y Zubizuri" preserveAspectRatio="xMidYMax meet">'
               + '<path class="hill2" d="M0 150 Q200 40 420 110 T820 80 T1200 110 V220 H0Z"/>' + funicular(40, 150)
               + tower(230, 170, 160) + salve(300, 176, 200) + guggenheim(540, 172, 0.95) + bridge(300, 172, 800) + puppy(1100, 172, 0.62)
               + river(1200, 170, 50) + '</svg>',
}

# Real dog photos (Wikimedia Commons, CC0/CC BY; see tools/photos/CREDITS.md) replace the dog scenes.
import base64, pathlib
ALT = {"hero": "Perros jugando / Dogs playing", "about": "Perro paseando / Dog out for a walk", "arrival": "Llegada / Arrival",
       "walk": "Paseo / Walk", "nap": "Siesta / Nap", "play": "Juego / Playtime", "polo": "Polo", "daisy": "Daisy"}
for _n, _alt in ALT.items():
    _b = base64.b64encode((pathlib.Path(__file__).parent / "photos" / f"{_n}.jpg").read_bytes()).decode()
    SCENES[_n] = f'<img class="il photo" alt="{_alt}" src="data:image/jpeg;base64,{_b}">'

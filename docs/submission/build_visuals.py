"""Render publication diagrams; optionally crop the real, private Chrome capture.

Uses Pillow already available on the author's machine. No application dependency.
Run from the repository root: python docs/submission/build_visuals.py
Optional: --raw-capture .git/media/chrome-source.png
"""
from pathlib import Path
import argparse
import html
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "assets"
OUT.mkdir(exist_ok=True)
FONT = Path("C:/Windows/Fonts")
INK, MUTED, TEAL, BG = "#172B38", "#516573", "#087F8C", "#F6F9FA"


class Canvas:
    def __init__(self, width, height):
        self.im = Image.new("RGB", (width, height), BG)
        self.d = ImageDraw.Draw(self.im)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
                    f'<rect width="100%" height="100%" fill="{BG}"/>']

    def rect(self, xy, fill="white", stroke="#D2DFE4", radius=16):
        self.d.rounded_rectangle(xy, radius, fill=fill, outline=stroke, width=2)
        x, y, r, b = xy
        self.svg.append(f'<rect x="{x}" y="{y}" width="{r-x}" height="{b-y}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')

    def text(self, x, y, value, size=26, bold=False, color=INK):
        font = ImageFont.truetype(str(FONT / ("segoeuib.ttf" if bold else "segoeui.ttf")), size)
        self.d.text((x, y), value, font=font, fill=color)
        self.svg.append(f'<text x="{x}" y="{y+size}" font-family="Segoe UI, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{html.escape(value)}</text>')

    def arrow(self, points, color=TEAL):
        self.d.line(points, fill=color, width=4)
        (px, py), (x, y) = points[-2:]
        if y > py: tip = [(x, y), (x-7, y-12), (x+7, y-12)]
        elif x > px: tip = [(x, y), (x-12, y-7), (x-12, y+7)]
        else: tip = [(x, y), (x+12, y-7), (x+12, y+7)]
        self.d.polygon(tip, fill=color)
        self.svg.append(f'<polyline points="{" ".join(f"{a},{b}" for a,b in points)}" fill="none" stroke="{color}" stroke-width="4"/>')
        self.svg.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in tip)}" fill="{color}"/>')

    def save(self, name):
        self.im.save(OUT / f"{name}.png")
        (OUT / f"{name}.svg").write_text("\n".join(self.svg + ["</svg>"]), encoding="utf-8")


def architecture():
    c = Canvas(1200, 1140)
    c.text(60, 32, "From selected response to speech", 38, True)
    c.text(60, 87, "Explain Aloud · implementation diagram", 24, color=MUTED)
    def node(x, y, w, title, detail, fill="white"):
        c.rect((x, y, x+w, y+90), fill)
        c.text(x+22, y+12, title, 28, True)
        c.text(x+22, y+51, detail, 21, color=MUTED)
    node(300, 142, 600, "Completed ChatGPT response", "DOM content selected through Explain Aloud")
    c.arrow([(600, 232), (600, 260)])
    node(300, 260, 600, "Semantic extraction → ResponseIR", "Headings · prose · lists · code · tables")
    c.arrow([(600, 350), (600, 378)])
    node(300, 378, 600, "Deterministic table facts", "Source values, row bindings, compatible comparisons")
    c.arrow([(600, 468), (600, 487), (300, 487), (300, 515)])
    c.arrow([(600, 468), (600, 487), (900, 487), (900, 515)])
    node(60, 515, 480, "Rules / Literal", "Simple blocks, small tables, Literal mode", "#EAF6F3")
    node(660, 515, 480, "Gemma via local Ollama", "Natural code / other tables; candidate wording", "#ECF2FC")
    c.arrow([(300, 605), (300, 628), (600, 628), (600, 655)])
    c.arrow([(900, 605), (900, 628), (600, 628), (600, 655)])
    node(300, 655, 600, "Validation + safe fallback", "Accepted candidates or source-derived fallback")
    c.arrow([(600, 745), (600, 773)])
    node(300, 773, 600, "NarrationPlan → segment audio queue", "Queue requests Kokoro speech and manages playback")
    c.arrow([(600, 863), (600, 891)])
    node(300, 891, 600, "Kokoro.js → browser audio", "Local WASM synthesis; one configured voice")
    c.text(130, 1015, "The Chrome side panel hosts the plan, inspector, and playback controls.", 26, True)
    c.text(130, 1060, "Validation is a guardrail, not a proof of semantic correctness.", 24, color=MUTED)
    c.save("03-architecture")


def before_after():
    # Take the exact asserted output from the checked-in regression test.
    test = (ROOT / "extension/src/pipeline/preDemoQuality.test.ts").read_text(encoding="utf-8")
    output = re.search(r"toBe\('(The table has three entries\.[^']+)'\)", test).group(1)
    c = Canvas(1200, 830)
    c.text(60, 30, "Same cells. A row-by-row listening order.", 36, True)
    c.text(60, 82, "Automated fixture evidence · not an application screenshot", 24, color=MUTED)
    c.text(60, 145, "SCREEN INPUT", 22, True, TEAL)
    columns = [90, 390, 660]
    for r, row in enumerate([['Name', 'Age', 'Role'], ['Alex', '20', 'Student'], ['Sam', '21', 'Developer'], ['John', '22', 'Engineer']]):
        y = 190 + r*59
        c.rect((60, y, 1140, y+59), "#EAF6F3" if r == 0 else "white", radius=0)
        for x, value in zip(columns, row): c.text(x, y+12, value, 27, r == 0)
    c.text(60, 465, "NATURAL NARRATION · EXACT TESTED TEXT", 22, True, TEAL)
    c.rect((60, 505, 1140, 745))
    for i, line in enumerate(output.split('. ')):
        c.text(85, 529+i*46, line if line.endswith('.') else line+'.', 28)
    c.text(60, 775, "All nine data cells retained · no Gemma call · no validation fallback in this test", 22, color=MUTED)
    c.save("04-table-before-after")


def screenshots(path):
    raw = Image.open(path).convert('RGB')
    if raw.size != (1938, 1098): raise ValueError('Unexpected capture geometry; inspect before cropping.')
    # Demo response + action button only: omit account, history, URL, and browser toolbar.
    raw.crop((490, 490, 1320, 888)).save(OUT / '01-chatgpt-table-button.png')
    # Actual panel; visibly redact only its unique response identifier.
    panel = raw.crop((1468, 272, 1900, 972))
    draw = ImageDraw.Draw(panel)
    draw.rectangle((16, 189, 431, 238), fill='#F1F3F5')
    font = ImageFont.truetype(str(FONT / 'segoeui.ttf'), 14)
    draw.text((22, 205), '[Response identifier redacted]', font=font, fill='#516573')
    panel.save(OUT / '02-natural-mode-panel.png')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw-capture', type=Path)
    args = parser.parse_args()
    architecture()
    before_after()
    if args.raw_capture: screenshots(args.raw_capture)
    print('Publication assets generated in docs/submission/assets')

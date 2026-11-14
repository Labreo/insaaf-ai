"""Capture hi-res app screens for the real-case demo matter (mat_025) and crop the 3D panel textures.
Needs backend :8000 + frontend :4173. python3 pitch/build/scripts/capture_real_case.py"""
import json, re
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CREDS = json.loads((ROOT / "backend/.demo_credentials").read_text())["passwords"]
SH, IMG, B = ROOT / "pitch/screenshots", ROOT / "pitch/build/img", "http://localhost:4173"
QUERY = "Plot sold by a power-of-attorney holder after a forged heirship claim; buyer's title; fraud vitiates the sale"


def skip(pg, ms=1500):
    b = pg.get_by_text("Skip intro", exact=False)
    try:
        b.first.wait_for(state="visible", timeout=ms); b.first.click(); b.first.wait_for(state="hidden", timeout=5000)
    except Exception:
        pass


with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=2, color_scheme="dark").new_page()
    pg.goto(B + "/"); pg.wait_for_timeout(1200)
    pg.get_by_role("button", name=re.compile("Sign in", re.I)).filter(visible=True).first.click()
    d = pg.get_by_role("dialog", name="Chamber sign in")
    d.get_by_placeholder("name@chamber.in or account ID").fill("senior_1"); d.locator('input[type="password"]').fill(CREDS["senior_1"]); d.locator('button[type="submit"]').click(); skip(pg, 6000)
    pg.goto(B + "/precedents"); skip(pg); pg.wait_for_timeout(2500)
    pg.get_by_placeholder(re.compile("Describe facts")).fill(QUERY)
    pg.get_by_placeholder(re.compile("Goa, Maharashtra")).fill("Goa"); pg.locator('button[type="submit"]').first.click()
    pg.wait_for_function("!document.body.innerText.includes('Searching index')", timeout=30000); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(SH / "20_news_search.png"))
    pg.goto(B + "/matters/mat_025"); skip(pg); pg.wait_for_timeout(2500)
    for tab in ["facts", "score", "proof", "precedents", "advice"]:
        pg.locator(f'[data-tab="{tab}"]').first.click(); pg.wait_for_timeout(2500); pg.screenshot(path=str(SH / f"21_mat025_{tab}.png"))
    pg.locator('[data-tab="draft"]').first.click(); pg.wait_for_timeout(2500)
    pg.get_by_placeholder(re.compile(r"Paste a case citation|legal proposition", re.I)).first.fill("Suraj Lamp & Industries v. State of Haryana")
    pg.get_by_role("button", name=re.compile("Verify & Insert")).first.click(); pg.wait_for_timeout(6000)
    pg.screenshot(path=str(SH / "21_mat025_draft.png"))
    br.close()

crops = {"panel_src_search": ("20_news_search", (250, 400, 1580, 1000)), "panel_src_score": ("21_mat025_score", (250, 290, 1240, 900)),
         "panel_src_facts": ("21_mat025_facts", (250, 348, 1240, 1000)), "panel_src_draft": ("21_mat025_draft", (250, 300, 1240, 1000))}
for name, (src, box) in crops.items():
    im = Image.open(SH / f"{src}.png").convert("RGB"); k = im.width / 1600
    c = im.crop(tuple(int(v * k) for v in box)); c.resize((2048, round(c.height * 2048 / c.width)), Image.LANCZOS).save(IMG / f"{name}.png")
    print(name)

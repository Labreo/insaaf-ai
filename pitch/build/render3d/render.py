"""Headless render of the procedural 3D scene (scene.js) to stills and camera-move clips.
Usage (from pitch/build): python3 render3d/render.py stills|clips|test"""
import base64, mimetypes, subprocess, sys, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

BUILD = Path(__file__).resolve().parents[1]
OUT_IMG, OUT_MEDIA = BUILD / "img", BUILD / "media"
FRAMES = BUILD / "render3d" / "_frames"
PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#06070a;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><canvas id="c"></canvas><script type="module" src="/render3d/scene.js"></script></body></html>"""


def serve(route):
    path = route.request.url.split("render.local", 1)[1].split("?")[0]
    if path in ("/", ""):
        return route.fulfill(status=200, body=PAGE, content_type="text/html")
    f = BUILD / path.lstrip("/")
    if not f.is_file():
        return route.fulfill(status=404, body="nf")
    ct = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    if f.suffix == ".js":
        ct = "text/javascript"
    route.fulfill(status=200, body=f.read_bytes(), content_type=ct)


def open_page(p, w, h):
    br = p.chromium.launch(args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": w, "height": h})
    pg.on("console", lambda m: print("console:", m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: print("pageerror:", e))
    pg.route("http://render.local/**", serve)
    pg.goto("http://render.local/")
    pg.wait_for_function("window.ready === true || window.loadError", timeout=60000)
    err = pg.evaluate("window.loadError")
    if err:
        raise SystemExit(err)
    pg.evaluate(f"window.setSize({w},{h})")
    return br, pg


def grab(pg, path, png=False):
    data = pg.evaluate("window.framePng()" if png else "window.frame()")
    Path(path).write_bytes(base64.b64decode(data.split(",", 1)[1]))


def stills(w=3200, h=1800, keys=range(1, 8)):
    with sync_playwright() as p:
        br, pg = open_page(p, w, h)
        for i in keys:
            pg.evaluate(f"window.renderKey({i}, 10)")
            grab(pg, OUT_IMG / f"r3d_s{i}.jpg")
            print("still", i, flush=True)
        br.close()


CLIPS = [(0, 1, 4.0), (1, 2, 3.2), (2, 3, 3.6), (3, 4, 3.6), (4, 5, 3.2), (5, 6, 3.0), (6, 7, 4.0)]


def clips(w=1920, h=1080, fps=30, only=None):
    with sync_playwright() as p:
        br, pg = open_page(p, w, h)
        for a, b, dur in CLIPS:
            if only and b not in only:
                continue
            d = FRAMES / f"c{b}"
            shutil.rmtree(d, ignore_errors=True); d.mkdir(parents=True)
            n = int(dur * fps)
            for f in range(n + 1):
                u = f / n
                t = 10 - dur + dur * u          # time ends at 10 so the clip's last frame matches the still
                pg.evaluate(f"window.renderBetween({a},{b},{u},{t})")
                grab(pg, d / f"{f:04d}.jpg")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", str(d / "%04d.jpg"),
                            "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                            str(OUT_MEDIA / f"move_s{b}.mp4")], check=True)
            print("clip", b, n + 1, "frames", flush=True)
        br.close()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"
    OUT_MEDIA.mkdir(exist_ok=True)
    if mode == "test":
        stills(1280, 720, [int(k) for k in sys.argv[2:]] or [1, 2, 4, 7])
    elif mode == "stills":
        stills()
    elif mode == "clips":
        clips(only=[int(k) for k in sys.argv[2:]] or None)
    elif mode == "still":
        stills(keys=[int(k) for k in sys.argv[2:]])

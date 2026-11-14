"""Add fade transitions to every slide and make each slide's 3D camera-move video start automatically.
python3 build/scripts/postprocess.py deck.pptx [--no-video]"""
import re, shutil, sys, tempfile, zipfile
from pathlib import Path

DUR_MS = {1: 4033, 2: 3233, 3: 3633, 4: 3633, 5: 3233, 6: 3033, 7: 4033}
TRANSITION = '<p:transition spd="med"><p:fade/></p:transition>'


def timing(spid, dur):
    return (
        '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
        '<p:par><p:cTn id="2" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
        '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
        '<p:par><p:cTn id="4" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
        f'<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="5" dur="{dur}" fill="hold"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:cmd>'
        '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
        f'<p:video><p:cMediaNode vol="0" mute="1"><p:cTn id="6" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cMediaNode></p:video>'
        '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'
    )


def main(deck, video=True):
    deck = Path(deck)
    tmp = Path(tempfile.mkdtemp())
    with zipfile.ZipFile(deck) as z:
        z.extractall(tmp)
        names = z.namelist()
    for f in sorted((tmp / "ppt" / "slides").glob("slide*.xml")):
        n = int(re.findall(r"\d+", f.stem)[0])
        x = f.read_text(encoding="utf-8")
        if "<p:transition" in x or "<p:timing" in x:
            continue
        add = TRANSITION
        m = re.search(r'<p:cNvPr id="(\d+)" name="3D camera move \d+"', x)
        if video and m and n in DUR_MS:
            add += timing(m.group(1), DUR_MS[n])
        x = x.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + add, 1)
        f.write_text(x, encoding="utf-8")
    out = deck.with_suffix(".tmp.pptx")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in names:           # keep original part order ([Content_Types].xml first)
            p = tmp / name
            if p.is_file():
                z.write(p, name, compress_type=zipfile.ZIP_STORED if name.endswith((".mp4", ".jpg", ".png")) else zipfile.ZIP_DEFLATED)
    shutil.move(out, deck)
    shutil.rmtree(tmp)
    print("post-processed", deck.name)


if __name__ == "__main__":
    main(sys.argv[1], video="--no-video" not in sys.argv)

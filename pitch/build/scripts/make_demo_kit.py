"""Fictional live-intake kit for the demo: a Goa property matter (Pereira v. Kamat, Margao).
python3 pitch/build/scripts/make_demo_kit.py  -> pitch/demo_kit/"""
import subprocess
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[2] / "demo_kit"
OUT.mkdir(exist_ok=True)


def doc(path, title, paras, stamp="FICTIONAL — DEMO DOCUMENT"):
    c = canvas.Canvas(str(path), pagesize=A4)
    W, H = A4
    def page_frame():
        c.saveState(); c.setFont("Helvetica-Bold", 46); c.setFillGray(0.9); c.translate(W / 2, H / 2); c.rotate(35)
        c.drawCentredString(0, 0, "FICTIONAL"); c.restoreState()
        c.setFont("Helvetica", 8); c.setFillGray(0.4); c.drawString(20 * mm, 12 * mm, stamp + " · Insaaf AI hackathon demo · no real persons or property")
        c.setFillGray(0)
    page_frame()
    y = H - 25 * mm
    c.setFont("Times-Bold", 15); c.drawCentredString(W / 2, y, title); y -= 12 * mm
    for p in paras:
        if p.startswith("##"):
            c.setFont("Times-Bold", 11.5); y -= 2 * mm; c.drawString(20 * mm, y, p[2:].strip()); y -= 7 * mm; continue
        c.setFont("Times-Roman", 11)
        words, line = p.split(), ""
        for w in words:
            if c.stringWidth(line + " " + w, "Times-Roman", 11) > W - 40 * mm:
                c.drawString(20 * mm, y, line.strip()); y -= 5.6 * mm; line = ""
                if y < 25 * mm:
                    c.showPage(); page_frame(); y = H - 25 * mm; c.setFont("Times-Roman", 11)
            line += " " + w
        c.drawString(20 * mm, y, line.strip()); y -= 8 * mm
    c.save()


doc(OUT / "01_agreement_for_sale_pereira_kamat_FICTIONAL.pdf", "AGREEMENT FOR SALE", [
    "This Agreement for Sale is executed at Margao, Salcete, South Goa on 18 March 2012 between Shri Anil Kamat, "
    "son of late Prakash Kamat, residing at Fatorda, Margao (hereinafter the VENDOR) and Smt. Maria Pereira, residing at "
    "Navelim, Salcete (hereinafter the PURCHASER).",
    "## 1. Property",
    "Plot bearing Survey No. 118/3 of Village Navelim, Salcete Taluka, admeasuring 420 square metres, surveyed under "
    "Form I & XIV in the name of the Vendor.",
    "## 2. Consideration",
    "The total consideration is Rs. 6,50,000 (Rupees Six Lakh Fifty Thousand only). Rs. 3,50,000 is paid by cheque "
    "no. 004512 drawn on a Margao bank on the date of this Agreement. The balance Rs. 3,00,000 was paid in cash; no "
    "receipt was issued for the cash payment.",
    "## 3. Possession",
    "The Vendor has handed over vacant and peaceful possession of the plot to the Purchaser on the date of this Agreement. "
    "The Purchaser has since constructed a compound wall and obtained an electricity connection in her own name.",
    "## 4. Conveyance",
    "The Vendor undertakes to execute and register a Sale Deed before the Sub-Registrar, Salcete within six months. "
    "The Vendor has simultaneously executed a General Power of Attorney in favour of the Purchaser. "
    "No Sale Deed has been registered as on the date of the client's instructions.",
    "## 5. Stamp duty",
    "This Agreement is executed on non-judicial stamp paper of Rs. 100. No further stamp duty has been paid.",
    "Signed: Anil Kamat (Vendor) · Maria Pereira (Purchaser) · Witnesses: (1) R. Naik (2) S. Dessai",
])
doc(OUT / "02_electricity_bill_pereira_FICTIONAL.pdf", "ELECTRICITY BILL (DUPLICATE COPY)", [
    "Consumer name: Smt. Maria Pereira · Consumer no. N-118-3-0042 · Supply address: Survey No. 118/3, Navelim, Salcete, Goa",
    "Connection date: 02 August 2012 · Billing period: September 2026 · Units consumed: 212 · Amount paid: Rs. 1,184",
    "This is a duplicate bill produced for the client file. It evidences the consumer's continuous possession of the "
    "premises since August 2012.",
])
doc(OUT / "03_notice_from_kamat_heirs_FICTIONAL.pdf", "LEGAL NOTICE", [
    "To: Smt. Maria Pereira, Navelim, Salcete. Date: 20 October 2026.",
    "Our clients, the legal heirs of the late Shri Anil Kamat, state that the plot at Survey No. 118/3, Navelim stands "
    "in the Form I & XIV records in the name of the Kamat family. No registered conveyance was ever executed in your "
    "favour. You are called upon to vacate the plot within 30 days, failing which our clients will file a suit for "
    "possession and mesne profits.",
])

brief = ("Smt. Maria Pereira bought a plot at Survey No. 118/3, Navelim, Salcete from Anil Kamat on 18 March 2012 under an "
         "agreement for sale and a general power of attorney. She paid Rs. 3,50,000 by cheque and Rs. 3,00,000 in cash without "
         "a receipt. She has been in possession since 2012 with an electricity connection in her name. No sale deed was "
         "registered. Anil Kamat's heirs sent a legal notice on 20 October 2026 demanding she vacate. She wants to protect "
         "her possession and title.")
(OUT / "04_case_brief_paste_FICTIONAL.txt").write_text(brief + "\n", encoding="utf-8")

hindi = ("मेरा नाम मारिया परेरा है। मैंने दो हज़ार बारह में नावेलिम में अनिल कामत जी से यह प्लॉट खरीदा था। "
         "हमारे पास बिक्री का एग्रीमेंट और पावर ऑफ अटॉर्नी है, लेकिन सेल डीड कभी रजिस्टर नहीं हुई। "
         "मैंने साढ़े तीन लाख रुपये चेक से दिए और तीन लाख नकद दिए, नकद की कोई रसीद नहीं है। "
         "बिजली का कनेक्शन मेरे नाम पर है और मैं तब से वहीं रहती हूँ। अब कामत जी के बेटे कहते हैं कि ज़मीन उनकी है।")
english = ("My name is Maria Pereira. In 2012 I bought this plot in Navelim from Mr. Anil Kamat. We have the sale agreement "
           "and a power of attorney, but the sale deed was never registered. I paid three and a half lakh rupees by cheque "
           "and three lakh in cash, and there is no receipt for the cash. The electricity connection is in my name and I have "
           "lived there since then. Now Mr. Kamat's sons say the land is theirs.")
(OUT / "05_client_voice_note_hindi_TRANSCRIPT_FICTIONAL.txt").write_text(
    "Voice: macOS synthetic voice 'Lekha' (hi_IN). Fictional client statement.\n\nHindi:\n" + hindi + "\n\nEnglish:\n" + english + "\n",
    encoding="utf-8")
aiff = OUT / "_tmp_voice.aiff"
subprocess.run(["say", "-v", "Lekha", "-r", "165", "-o", str(aiff), hindi], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-ac", "1", "-ar", "16000", str(OUT / "05_client_voice_note_hindi_FICTIONAL.wav")], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-c:a", "aac", "-b:a", "96k", str(OUT / "05_client_voice_note_hindi_FICTIONAL.m4a")], check=True)
aiff.unlink()
print("kit ->", OUT)

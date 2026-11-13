"""Generate fictional PDF, DOCX, and Konkani voice fixtures for demo matters."""
from pathlib import Path
import json
import wave
import struct
import fitz
from docx import Document

BASE = Path(__file__).resolve().parent / "matters"


def create_pdf(path: Path, pages: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((50, 60), text, fontsize=11)
    doc.save(str(path))
    doc.close()


def create_docx(path: Path, title: str, paragraphs: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    doc.add_heading(title, level=1)
    for p in paragraphs:
        doc.add_paragraph(p)
    doc.save(str(path))


def create_silent_wav(path: Path, seconds: float = 1.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16000
    n_frames = int(sample_rate * seconds)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack("<" + "h" * n_frames, *([0] * n_frames)))


def main() -> None:
    # mat_001: Fernandes v. Naik — Property (weak score)
    m1 = BASE / "mat_001"
    create_pdf(
        m1 / "agreement_of_sale_fictional.pdf",
        [
            "FICTIONAL DEMO DOCUMENT — FOR HACKATHON TESTING ONLY\n\n"
            "AGREEMENT OF SALE AND GENERAL POWER OF ATTORNEY\n"
            "Executed at Mapusa, Bardez, North Goa on 14 February 2009.\n"
            "Vendor: Mr. Naik (bhatkar representative)\n"
            "Purchaser: Mrs. Maria Fernandes\n"
            "Property: Plot Survey No. 44/2, Sub-Division 3, Mapusa, North Goa (320 sq. m.).\n",
            "CLAUSE 3: Possession of the said plot was handed over to the Purchaser in February 2009.\n"
            "NOTE: This transaction was executed only through an Agreement of Sale and Power of Attorney,\n"
            "not a registered sale deed before the Sub-Registrar of Bardez.\n"
            "Stamp duty paid is ₹500 on non-judicial stamp paper (deficit stamp duty noted).\n"
            "Attached: Mapusa Municipal house-tax receipts (2011-2025) and Electricity Department bill.\n"
            "Payment trail: Date of last payment to seller is unknown / unverified cash entries.\n",
        ],
    )
    create_docx(
        m1 / "chamber_intake_notes_fictional.docx",
        "FICTIONAL — Chamber Intake Notes (Fernandes v. Naik)",
        [
            "Client: Mrs. Maria Fernandes (occupied Survey No. 44/2, Mapusa since 2009).",
            "Issue: Opposite party Naik claims title via Form I & XIV entry in revenue records.",
            "Proof note: Electricity bill and house-tax receipts are available for continuous possession.",
            "Draft review alert: Prior junior draft mistakenly cited IPC 302 / IPC 420 for a 2025 trespass complaint and cited Suresh Kumar Koushal v. Naz Foundation.",
            "Leading authority: Suraj Lamp & Industries v. State of Haryana (2011) holds that SA/GPA/Will transactions do not transfer title without a registered conveyance deed.",
            "Limitation note: Dispossession threat arose 2013; COVID-19 exclusion 2020-03-15 to 2022-02-28 applies.",
        ],
    )
    (m1 / "client_voice_note_kok.json").write_text(
        json.dumps(
            {
                "fictional": True,
                "language": "kok",
                "duration_range": "00:12–00:24",
                "original_text": "हांव २००९ सावन ह्या जमनीर रावतां. म्हाका मुखत्यारपत्र आनी करार दिलो, पूण रजिस्टर विक्री खत जावंक ना.",
                "english_translation": "Client says she has occupied the plot since 2009.",
                "translation_confidence": "medium",
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    create_silent_wav(m1 / "client_voice_note_kok.wav", seconds=1.0)

    # mat_002: Shetty Traders — Civil recovery (strong score)
    m2 = BASE / "mat_002"
    create_docx(
        m2 / "shetty_traders_invoices_fictional.docx",
        "FICTIONAL — Commercial Recovery Dossier (Shetty Traders)",
        [
            "FICTIONAL DEMO MATTER — Commercial money recovery ₹4,20,000.",
            "Signed Purchase Order No. PO-2022-091 executed between Shetty Traders and Konkan Hardware Supplies.",
            "Tax invoices and GST e-way bills with acknowledged delivery challan dated 18 February 2022.",
            "Bank statement shows NEFT part-payment of ₹80,000 on 10 March 2023 and written balance confirmation.",
            "Pre-institution mediation under s.12A Commercial Courts Act initiated; non-starter report enclosed.",
            "Registered demand notice served with full stamp duty paid where applicable.",
        ],
    )

    # mat_003: State v. R. Gaonkar — Criminal plea eligibility check
    m3 = BASE / "mat_003"
    create_docx(
        m3 / "state_v_gaonkar_chargesheet_fictional.docx",
        "FICTIONAL — Criminal Brief (State v. R. Gaonkar)",
        [
            "FICTIONAL DEMO MATTER — Plea bargaining eligibility review.",
            "FIR No. 88/2025 dated 14 August 2025, Mapusa Police Station; Chargesheet filed under BNS 303(2) (formerly IPC 379).",
            "Maximum imprisonment under BNS s.303(2) is 3 years (under 7 years threshold for BNSS s.289).",
            "Accused R. Gaonkar is a first-time offender with no prior conviction.",
            "Offence is not a socio-economic offence and is not committed against a woman or child under 14.",
            "Note: Draft bail application references CrPC 438 instead of BNSS 482.",
        ],
    )
    print("Generated all fictional demo fixtures under", BASE)


if __name__ == "__main__":
    main()


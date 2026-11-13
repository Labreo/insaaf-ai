import type { AccessLogEntry, Alert, LedgerEntry } from './types'

export interface DemoIntakeSample {
  id: string
  area: string
  label: string
  title: string
  forum_hint: string
  state: string
  district: string
  court_seat: string
  client_language: string
  client_name: string
  opposite_party: string
  cause_date: string
  summary: string
  filename: string
  content: string
}

export interface DemoShowcaseMatter {
  id: string
  title: string
  case_type: string
  forum_hint: string
  state: string
  district: string
  days_left: number | null
  status: string
  summary: string
  synthetic: true
  badge: 'ILLUSTRATIVE DEMO PREVIEW'
}

export const DEMO_INTAKE_SAMPLES: DemoIntakeSample[] = [
  {
    id: 'demo_property_gpa',
    area: 'property',
    label: 'Property · GPA Possession',
    title: 'Fernandes v. Naik — Plot 44/2 Possession & Specific Performance',
    forum_hint: 'Civil Judge Senior Division, Mapusa',
    state: 'Goa',
    district: 'North Goa',
    court_seat: 'Mapusa',
    client_language: 'kok',
    client_name: 'Smt. Maria Fernandes',
    opposite_party: 'Shri Ramesh Naik',
    cause_date: '2019-06-14',
    summary:
      'Buyer in peaceful possession since 2009 under Agreement of Sale + notarised GPA claims title protection after bhatkar representative refused conveyance.',
    filename: 'agreement_of_sale_gpa.txt',
    content:
      'AGREEMENT OF SALE AND GENERAL POWER OF ATTORNEY executed on 2009-02-14 at Mapusa, North Goa between Shri Ramesh Naik and Smt. Maria Fernandes regarding Survey No. 44/2, Sub-Division 3. Unregistered notarised instrument on Rs. 100 stamp paper. Total consideration Rs. 8,50,000 paid in instalments; Form I & XIV mutation remains in opposite party name. Notice demanding execution of registered Sale Deed served on 2019-06-14.',
  },
  {
    id: 'demo_commercial_invoices',
    area: 'civil_recovery',
    label: 'Commercial · s.12A Recovery',
    title: 'Shetty Traders v. Coastal Hospitality — ₹4.2L Supply Arrears',
    forum_hint: 'District Commercial Court, Panaji',
    state: 'Goa',
    district: 'North Goa',
    court_seat: 'Panaji',
    client_language: 'mr',
    client_name: 'M/s Shetty Traders',
    opposite_party: 'Coastal Hospitality Pvt. Ltd.',
    cause_date: '2024-03-18',
    summary:
      'Unpaid hospitality linen & kitchen supply invoices across Q1 with email balance confirmation; Commercial Courts Act s.12A mediation required before suit.',
    filename: 'commercial_invoices_ack.txt',
    content:
      'Commercial supply dispute for Rs. 4,20,000 across 6 GST tax invoices delivered between January and March 2024 by M/s Shetty Traders to Coastal Hospitality Pvt. Ltd. Accounts director acknowledged balance of Rs. 4,20,000 via email dated 2024-03-18 promising RTGS clearance within 15 days. Statutory demand notice sent by Registered Post AD; pre-institution mediation under s.12A Commercial Courts Act, 2015 pending.',
  },
  {
    id: 'demo_criminal_plea',
    area: 'criminal',
    label: 'Criminal · BNSS s.290 Plea',
    title: 'State v. Kulkarni — BNS s.303(2) Restitution & Plea Application',
    forum_hint: 'Judicial Magistrate First Class, Pune',
    state: 'Maharashtra',
    district: 'Pune',
    court_seat: 'Pune',
    client_language: 'hi',
    client_name: 'Vikram Kulkarni',
    opposite_party: 'State of Maharashtra',
    cause_date: '2024-09-03',
    summary:
      'First-time accused charged under BNS s.303(2) (<7 yrs imprisonment, non-socio-economic); seeks mutually satisfactory disposition and restitution under BNSS s.290.',
    filename: 'bns_303_chargesheet.txt',
    content:
      'FIR and Final Report under BNS s.303(2) (punishable up to 3 years imprisonment, below 7 years threshold) filed before JMFC Pune on 2024-09-03. Offence is neither notified as affecting the socio-economic condition of the country nor committed against a woman or child below 14 years. Zero prior convictions recorded in SCRB verification; complainant indicates willingness for mutually satisfactory disposition under BNSS s.290.',
  },
  {
    id: 'demo_cheque_138',
    area: 'cheque_bounce',
    label: 'NI Act s.138 · Dishonour',
    title: 'Mehta Precision v. Konkan Infra — s.138 Cheque Dishonour',
    forum_hint: 'Metropolitan Magistrate (NI Act), Mumbai',
    state: 'Maharashtra',
    district: 'Mumbai',
    court_seat: 'Andheri',
    client_language: 'gu',
    client_name: 'Mehta Precision Works',
    opposite_party: 'Konkan Infra Projects',
    cause_date: '2026-08-21',
    summary:
      'Cheque No. 482910 for Rs. 6,75,000 dishonoured ("Funds Insufficient"); s.138(b) demand notice served within 30 days of return memo; strict 45-day complaint window.',
    filename: 'ni138_return_memo.txt',
    content:
      'Cheque No. 482910 dated 2026-08-10 for Rs. 6,75,000 drawn on Saraswat Bank by Konkan Infra Projects in discharge of machinery fabrication invoice was returned unpaid on 2026-08-14 with memo "Funds Insufficient". Statutory demand notice under s.138(b) Negotiable Instruments Act dispatched on 2026-08-21 and delivered via Speed Post tracking on 2026-08-24. Drawer failed to tender payment within 15 days of receipt.',
  },
  {
    id: 'demo_writ_service',
    area: 'writ_service',
    label: 'Writ · Art. 226 Service',
    title: 'Rao v. State PWD — Sealed-Cover Promotion Arrears (Art. 226)',
    forum_hint: 'High Court of Karnataka, Bengaluru Bench',
    state: 'Karnataka',
    district: 'Bengaluru Urban',
    court_seat: 'Bengaluru',
    client_language: 'kn',
    client_name: 'S. Raghavendra Rao',
    opposite_party: 'State of Karnataka (PWD)',
    cause_date: '2025-11-10',
    summary:
      'Executive Engineer exonerated in departmental inquiry seeks opening of DPC sealed cover and consequential seniority/arrears under K.V. Jankiraman ratio.',
    filename: 'dpc_exoneration_order.txt',
    content:
      'Petitioner S. Raghavendra Rao, Executive Engineer (PWD), was placed under sealed-cover DPC consideration in March 2023 pending Charge Memo dated 2022-11-04. Final Inquiry Report and Government Order dated 2025-11-10 exonerated the petitioner of all charges. Despite representations dated 2025-12-01 and 2026-02-15 citing Union of India v. K.V. Jankiraman (1991) 4 SCC 109, the department has not opened the sealed cover.',
  },
  {
    id: 'demo_consumer_housing',
    area: 'consumer',
    label: 'Consumer · Housing Delay',
    title: 'Iyer v. Horizon Builders — RERA & CPA Possession Delay Refund',
    forum_hint: 'State Consumer Disputes Redressal Commission, Chennai',
    state: 'Tamil Nadu',
    district: 'Chennai',
    court_seat: 'Chennai',
    client_language: 'ta',
    client_name: 'Ananya & Karthik Iyer',
    opposite_party: 'Horizon Urban Builders Ltd.',
    cause_date: '2025-07-01',
    summary:
      'Flat booked with 90% consideration paid remains incomplete 38 months past promised completion date; homebuyers seek refund with statutory interest and compensation.',
    filename: 'builder_buyer_agreement.txt',
    content:
      'Registered Construction Agreement dated 2020-01-18 between Complainants and Horizon Urban Builders Ltd. stipulated handover of Apartment 11B by 2022-05-31. Complainants disbursed Rs. 78,40,000 out of Rs. 85,00,000 via housing loan tranches. Occupation Certificate has not been applied for as of 2025-07-01 despite repeated structural defect notices.',
  },
]

export const DEMO_SHOWCASE_MATTERS: DemoShowcaseMatter[] = [
  {
    id: 'demo_showcase_01',
    title: 'Fernandes v. Naik — Specific Performance & Unregistered GPA',
    case_type: 'property',
    forum_hint: 'Civil Judge Senior Division, Mapusa',
    state: 'Goa',
    district: 'North Goa',
    days_left: 42,
    status: 'ready',
    summary: 'Illustrates Suraj Lamp s.17 Registration Act bar vs s.53A part-performance defence.',
    synthetic: true,
    badge: 'ILLUSTRATIVE DEMO PREVIEW',
  },
  {
    id: 'demo_showcase_02',
    title: 'Shetty Traders v. Coastal Hospitality — Commercial Recovery',
    case_type: 'civil_recovery',
    forum_hint: 'District Commercial Court, Panaji',
    state: 'Goa',
    district: 'North Goa',
    days_left: 84,
    status: 'in_review',
    summary: 'Illustrates Commercial Courts Act s.12A mandatory pre-institution mediation gate.',
    synthetic: true,
    badge: 'ILLUSTRATIVE DEMO PREVIEW',
  },
  {
    id: 'demo_showcase_03',
    title: 'Mehta Precision v. Konkan Infra — NI Act s.138 Dishonour',
    case_type: 'cheque_bounce',
    forum_hint: 'Metropolitan Magistrate (NI Act), Mumbai',
    state: 'Maharashtra',
    district: 'Mumbai',
    days_left: 19,
    status: 'running',
    summary: 'Illustrates strict 30-day demand + 15-day cure + 30-day statutory complaint clock.',
    synthetic: true,
    badge: 'ILLUSTRATIVE DEMO PREVIEW',
  },
]

export const DEMO_ALERTS_PREVIEW: (Alert & { synthetic: true })[] = [
  {
    id: 'demo_al_1',
    matter_id: 'demo_showcase_03',
    title: 'Mehta Precision v. Konkan Infra — s.138(b)/142(1)(b) Complaint Window',
    kind: 'limitation',
    due: '2026-10-08',
    days_left: 19,
    level: 'urgent',
    synthetic: true,
  },
  {
    id: 'demo_al_2',
    matter_id: 'demo_showcase_02',
    title: 'Shetty Traders v. Coastal Hospitality — s.12A Pre-Suit Mediation',
    kind: 'mediation_window',
    due: '2026-11-28',
    days_left: 70,
    level: 'warn',
    synthetic: true,
  },
  {
    id: 'demo_al_3',
    matter_id: 'demo_showcase_01',
    title: 'Fernandes v. Naik — Senior Counsel Sign-Off on Proof Gaps',
    kind: 'review_pending',
    due: '2027-01-15',
    days_left: 118,
    level: 'info',
    synthetic: true,
  },
]

export const DEMO_LEDGER_PREVIEW: (LedgerEntry & { synthetic: true })[] = [
  {
    id: 'demo_led_1',
    actor: 'Adv. Rajeshwari Deshmukh',
    role: 'senior',
    matter_id: 'demo_mat_01',
    action: 'override',
    target: 'score',
    target_id: 'score',
    reason_code: 'score_disagree',
    note: 'Downgraded band to Weak pending certified Form I & XIV extract and registered sale deed check.',
    at: '2026-10-12T10:15:00Z',
    hash: '9e4d7b21f0c84321ab65e0d411c8a910',
    prev_hash: '00000000000000000000000000000000',
    synthetic: true,
  },
  {
    id: 'demo_led_2',
    actor: 'Adv. Arjun Sawant',
    role: 'junior',
    matter_id: 'demo_mat_01',
    action: 'edit',
    target: 'fact',
    target_id: 'f2',
    reason_code: 'wrong_fact',
    note: 'Verified Konkani voice translation against bank RTGS counterfoil dated 2009-02-14.',
    at: '2026-10-12T11:40:00Z',
    hash: '4a12c8f932d18802e54f22a089d3c741',
    prev_hash: '9e4d7b21f0c84321ab65e0d411c8a910',
    synthetic: true,
  },
  {
    id: 'demo_led_3',
    actor: 'Adv. Rajeshwari Deshmukh',
    role: 'senior',
    matter_id: 'demo_mat_02',
    action: 'approve',
    target: 'advice',
    target_id: 'advice',
    reason_code: 'other',
    note: 'Approved s.12A commercial mediation before issuing High Court commercial summary plaint.',
    at: '2026-10-13T09:05:00Z',
    hash: '7c99e1b304f8d22a6c40b8e2541af602',
    prev_hash: '4a12c8f932d18802e54f22a089d3c741',
    synthetic: true,
  },
]

export const DEMO_CUSTODY_PREVIEW: (AccessLogEntry & { synthetic: true })[] = [
  {
    id: 9001,
    actor: 'Adv. Rajeshwari Deshmukh',
    role: 'senior',
    matter_id: 'demo_mat_01',
    endpoint: 'POST /v1/matters/demo_mat_01/draft/export?format=docx',
    at: '2026-11-14T02:15:00Z',
    synthetic: true,
  },
  {
    id: 9002,
    actor: 'Adv. Arjun Sawant',
    role: 'junior',
    matter_id: 'demo_mat_01',
    endpoint: 'POST /v1/matters/demo_mat_01/reviews',
    at: '2026-11-14T01:40:00Z',
    synthetic: true,
  },
  {
    id: 9003,
    actor: 'Priya Kamat',
    role: 'clerk',
    matter_id: 'demo_mat_02',
    endpoint: 'POST /v1/matters/demo_mat_02/documents',
    at: '2026-11-13T18:20:00Z',
    synthetic: true,
  },
]

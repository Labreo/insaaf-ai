/**
 * Practice areas, languages and instruments from GET /v1/meta (rules/practice_areas.yaml).
 * Fetched once per page load and shared by every screen.
 */
import { useEffect, useState } from 'react'
import type { Meta, PracticeArea } from './types'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/v1'

const FALLBACK: Meta = {
  areas: [
    {
      id: 'property',
      label: 'Civil — Property & Title',
      tag: 'PROP',
      group: 'Civil',
      forum: 'Civil Judge Senior Division',
      limitation: { article: 'Limitation Act, 1963 — Art. 65 (possession based on title)', years: 12, note: '' },
      commercial_court: false,
      adr_routes: ['s.89 CPC', 'Lok Adalat'],
      instruments: ['legal_notice', 'plaint', 'written_statement'],
      statutes: ['Transfer of Property Act, 1882', 'Registration Act, 1908 s.17', 'Specific Relief Act, 1963'],
    },
    {
      id: 'civil_recovery',
      label: 'Civil — Money Recovery',
      tag: 'CIV',
      group: 'Civil',
      forum: 'Civil Judge Senior Division',
      limitation: { article: 'Limitation Act, 1963 — Art. 14 / 18 / 19 (3 years)', years: 3, note: '' },
      commercial_court: false,
      adr_routes: ['s.89 CPC', 'Lok Adalat'],
      instruments: ['legal_notice', 'plaint', 'summary_suit'],
      statutes: ['Code of Civil Procedure, 1908 Order XXXVII', 'Indian Contract Act, 1872'],
    },
    {
      id: 'commercial',
      label: 'Commercial Dispute',
      tag: 'COMM',
      group: 'Commercial',
      forum: 'Commercial Court (District level)',
      limitation: { article: 'Limitation Act, 1963 — Art. 55 (breach of contract, 3 years)', years: 3, note: '' },
      commercial_court: true,
      adr_routes: ['Pre-institution mediation (s.12A)', 'Arbitration (if clause)', 'Lok Adalat'],
      instruments: ['legal_notice', 'commercial_plaint', 'written_statement'],
      statutes: ['Commercial Courts Act, 2015 s.12A', 'Indian Contract Act, 1872 s.73'],
    },
    {
      id: 'cheque_bounce',
      label: 'Cheque Dishonour (NI Act s.138)',
      tag: 'S138',
      group: 'Commercial',
      forum: 'Judicial Magistrate First Class',
      limitation: {
        article: 'NI Act s.138(b)/(c), s.142 — notice within 30 days of memo; complaint within 1 month of cause',
        years: null,
        note: 'Statutory clock runs in days: demand notice within 30 days of return memo, 15 days for payment, complaint within 30 days thereafter.',
      },
      commercial_court: false,
      adr_routes: ['Compounding (s.147 NI Act)', 'Lok Adalat', 'Mediation'],
      instruments: ['s138_notice', 's138_complaint'],
      statutes: ['Negotiable Instruments Act, 1881 ss.138, 139, 142, 143A, 147'],
    },
    {
      id: 'consumer',
      label: 'Consumer Complaint',
      tag: 'CONS',
      group: 'Consumer',
      forum: 'District Consumer Disputes Redressal Commission',
      limitation: { article: 'Consumer Protection Act, 2019 — s.69 (2 years)', years: 2, note: '' },
      commercial_court: false,
      adr_routes: ['Consumer mediation cell (s.74)', 'Lok Adalat'],
      instruments: ['legal_notice', 'consumer_complaint'],
      statutes: ['Consumer Protection Act, 2019 ss.2(11), 2(47), 35, 69'],
    },
    {
      id: 'rent_tenancy',
      label: 'Rent & Tenancy / Eviction',
      tag: 'RENT',
      group: 'Civil',
      forum: 'Rent Controller',
      limitation: {
        article: 'Limitation Act, 1963 — Art. 67 (12 years); arrears Art. 52 (3 years)',
        years: 3,
        note: 'Clock shown is for arrears of rent; eviction on determination of tenancy runs 12 years.',
      },
      commercial_court: false,
      adr_routes: ['Lok Adalat', 's.89 CPC'],
      instruments: ['legal_notice', 'eviction_petition'],
      statutes: ['Goa, Daman and Diu Buildings (Lease, Rent and Eviction) Control Act, 1968', 'Transfer of Property Act, 1882 s.106'],
    },
    {
      id: 'family_matrimonial',
      label: 'Family — Matrimonial',
      tag: 'FAM',
      group: 'Family',
      forum: 'Family Court',
      limitation: {
        article: 'No general limitation for divorce; HMA s.13(1A) — 1 year after decree of judicial separation',
        years: null,
        note: 'Matrimonial reliefs are not barred by a fixed limitation period; statutory waiting periods apply instead.',
      },
      commercial_court: false,
      adr_routes: ['Court-annexed mediation', 'Family counselling'],
      instruments: ['legal_notice', 'divorce_petition'],
      statutes: ['Hindu Marriage Act, 1955 ss.13, 13B', 'Special Marriage Act, 1954', 'Family Courts Act, 1984'],
    },
    {
      id: 'maintenance',
      label: 'Family — Maintenance',
      tag: 'MAIN',
      group: 'Family',
      forum: 'Family Court / JMFC',
      limitation: {
        article: 'BNSS s.144 (old CrPC s.125) — arrears recoverable within 1 year of falling due (s.147(3))',
        years: 1,
        note: 'The right to claim maintenance is continuing; only recovery of arrears is limited to 1 year.',
      },
      commercial_court: false,
      adr_routes: ['Court-annexed mediation', 'Family counselling'],
      instruments: ['legal_notice', 'maintenance_petition'],
      statutes: ['BNSS, 2023 s.144 (CrPC s.125)', 'Hindu Adoptions and Maintenance Act, 1956 s.18', 'Protection of Women from Domestic Violence Act, 2005'],
    },
    {
      id: 'motor_accident',
      label: 'Motor Accident Claim (MACT)',
      tag: 'MACT',
      group: 'Tort',
      forum: 'Motor Accident Claims Tribunal',
      limitation: {
        article: 'Motor Vehicles Act, 1988 — s.166(3) (6 months from accident, as amended 2019)',
        years: null,
        note: 'Claims must be filed within 6 months of the accident (s.166(3)); verify condonation position in hardship cases.',
      },
      commercial_court: false,
      adr_routes: ['Lok Adalat (MACT)', 'Insurer settlement (s.149)'],
      instruments: ['legal_notice', 'mact_claim'],
      statutes: ['Motor Vehicles Act, 1988 ss.140, 163A, 166'],
    },
    {
      id: 'labour',
      label: 'Labour & Employment',
      tag: 'LAB',
      group: 'Labour',
      forum: 'Labour Court / Industrial Tribunal',
      limitation: { article: 'Industrial Disputes Act s.2A(3) — 3 years for individual dispute on discharge/dismissal', years: 3, note: '' },
      commercial_court: false,
      adr_routes: ['Conciliation (s.12 ID Act)', 'Lok Adalat'],
      instruments: ['legal_notice', 'labour_claim'],
      statutes: ['Industrial Disputes Act, 1947 ss.2A, 25F', 'Code on Wages, 2019', 'Payment of Gratuity Act, 1972'],
    },
    {
      id: 'writ_service',
      label: 'Writ & Service Matters',
      tag: 'WRIT',
      group: 'Constitutional',
      forum: 'High Court (Art. 226)',
      limitation: {
        article: 'No statutory limitation; delay and laches doctrine applies',
        years: null,
        note: 'Writ courts refuse relief for unexplained delay; service disputes may lie first before a Tribunal (CAT/SAT).',
      },
      commercial_court: false,
      adr_routes: ['Representation to authority', 'Departmental appeal'],
      instruments: ['legal_notice', 'writ_petition'],
      statutes: ['Constitution of India Arts. 14, 16, 226', 'Administrative Tribunals Act, 1985'],
    },
    {
      id: 'criminal',
      label: 'Criminal — Plea & Bail',
      tag: 'CRIM',
      group: 'Criminal',
      forum: 'Judicial Magistrate First Class',
      limitation: {
        article: 'BNSS s.514 (CrPC s.468) — bar on cognizance only for offences punishable up to 3 years',
        years: null,
        note: 'Limitation for cognizance applies only to offences punishable with fine or up to 3 years.',
      },
      commercial_court: false,
      adr_routes: ['Plea bargaining (BNSS s.289)', 'Compounding (BNSS s.359)'],
      instruments: ['plea_application', 'bail_application'],
      statutes: ['Bharatiya Nagarik Suraksha Sanhita, 2023', 'Bharatiya Nyaya Sanhita, 2023'],
    },
    {
      id: 'arbitration',
      label: 'Arbitration',
      tag: 'ARB',
      group: 'Commercial',
      forum: 'High Court / Commercial Court (ss.9, 11, 34)',
      limitation: { article: 'Arbitration Act s.43 + Limitation Act Art. 137 (3 years for s.11); s.34 — 3 months + 30 days', years: 3, note: '' },
      commercial_court: true,
      adr_routes: ['Arbitral tribunal', 'Mediation'],
      instruments: ['legal_notice', 's11_application'],
      statutes: ['Arbitration and Conciliation Act, 1996 ss.8, 9, 11, 34'],
    },
    {
      id: 'succession_probate',
      label: 'Succession & Probate',
      tag: 'SUCC',
      group: 'Family',
      forum: 'District Court (Probate)',
      limitation: { article: 'Limitation Act Art. 137 (3 years from when right to apply accrues)', years: 3, note: '' },
      commercial_court: false,
      adr_routes: ['Family settlement', 'Mediation'],
      instruments: ['legal_notice', 'probate_petition'],
      statutes: ['Indian Succession Act, 1925', 'Hindu Succession Act, 1956 s.6', 'Goa Succession, Special Notaries and Inventory Proceeding Act, 2012'],
    },
    {
      id: 'intellectual_property',
      label: 'Intellectual Property',
      tag: 'IP',
      group: 'Commercial',
      forum: 'Commercial Court / High Court (IP Division)',
      limitation: { article: 'Limitation Act Art. 88 (3 years) — continuing infringement gives fresh cause', years: 3, note: '' },
      commercial_court: true,
      adr_routes: ['Pre-institution mediation (s.12A)', 'Cease-and-desist settlement'],
      instruments: ['legal_notice', 'ip_plaint'],
      statutes: ['Trade Marks Act, 1999 ss.29, 134', 'Copyright Act, 1957 s.62'],
    },
  ],
  languages: [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'Hindi' },
    { code: 'kok', label: 'Konkani' },
    { code: 'mr', label: 'Marathi' },
    { code: 'gu', label: 'Gujarati' },
    { code: 'ta', label: 'Tamil' },
    { code: 'te', label: 'Telugu' },
    { code: 'kn', label: 'Kannada' },
    { code: 'ml', label: 'Malayalam' },
    { code: 'bn', label: 'Bengali' },
    { code: 'pa', label: 'Punjabi' },
    { code: 'ur', label: 'Urdu' },
  ],
  instruments: [
    { id: 'legal_notice', label: 'Legal notice', kind: 'notice' },
    { id: 'plaint', label: 'Plaint (Order VII Rule 1 CPC)', kind: 'pleading' },
    { id: 'written_statement', label: 'Written statement (Order VIII CPC)', kind: 'pleading' },
    { id: 'summary_suit', label: 'Summary suit (Order XXXVII CPC)', kind: 'pleading' },
    { id: 'commercial_plaint', label: 'Commercial suit (Commercial Courts Act)', kind: 'pleading' },
    { id: 's138_notice', label: 'Demand notice (NI Act s.138)', kind: 'notice' },
    { id: 's138_complaint', label: 'Complaint (NI Act s.138)', kind: 'pleading' },
    { id: 'consumer_complaint', label: 'Consumer complaint (CPA 2019, s.35)', kind: 'pleading' },
    { id: 'eviction_petition', label: 'Eviction petition (Rent Controller)', kind: 'pleading' },
    { id: 'divorce_petition', label: 'Divorce petition (HMA)', kind: 'pleading' },
    { id: 'maintenance_petition', label: 'Maintenance petition (BNSS s.144)', kind: 'application' },
    { id: 'mact_claim', label: 'Claim petition (MV Act s.166)', kind: 'application' },
    { id: 'labour_claim', label: 'Statement of claim (ID Act)', kind: 'pleading' },
    { id: 'writ_petition', label: 'Writ petition (Art. 226)', kind: 'pleading' },
    { id: 'plea_application', label: 'Plea bargaining application (BNSS s.290)', kind: 'application' },
    { id: 'bail_application', label: 'Bail application (BNSS s.480/483)', kind: 'application' },
    { id: 's11_application', label: 'Application (Arbitration Act s.11)', kind: 'application' },
    { id: 'probate_petition', label: 'Probate petition', kind: 'application' },
    { id: 'ip_plaint', label: 'IP infringement suit', kind: 'pleading' },
  ],
}

let cache: Meta | null = null
let inflight: Promise<Meta> | null = null
const subs = new Set<(m: Meta) => void>()

export function loadMeta(): Promise<Meta> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch(`${BASE}/meta`)
      .then((r) => (r.ok ? (r.json() as Promise<Partial<Meta>>) : FALLBACK))
      .catch(() => FALLBACK)
      .then((m) => {
        const merged: Meta = {
          areas: m?.areas?.length ? m.areas : FALLBACK.areas,
          languages: m?.languages?.length ? m.languages : FALLBACK.languages,
          instruments: m?.instruments?.length ? m.instruments : FALLBACK.instruments,
        }
        cache = merged
        subs.forEach((fn) => fn(merged))
        return merged
      })
  }
  return inflight
}

export function useMeta(): Meta {
  const [meta, setMeta] = useState<Meta>(cache ?? FALLBACK)
  useEffect(() => {
    subs.add(setMeta)
    loadMeta().then(setMeta)
    return () => {
      subs.delete(setMeta)
    }
  }, [])
  return meta
}

export function areaOf(meta: Meta, id: string | undefined | null): PracticeArea | undefined {
  return meta.areas.find((a) => a.id === id)
}

export function areaLabel(meta: Meta, id: string | undefined | null): string {
  return areaOf(meta, id)?.label ?? (id ?? '').replace(/_/g, ' ')
}

export function areaTag(meta: Meta, id: string | undefined | null): string {
  return areaOf(meta, id)?.tag ?? (id ?? '').slice(0, 4).toUpperCase()
}

export function languageLabel(meta: Meta, code: string | undefined | null): string {
  return meta.languages.find((l) => l.code === code)?.label ?? (code ?? '').toUpperCase()
}

export function instrumentLabel(meta: Meta, id: string): string {
  return meta.instruments.find((i) => i.id === id)?.label ?? id.replace(/_/g, ' ')
}

export function instrumentKind(meta: Meta, id: string): 'notice' | 'pleading' | 'application' {
  const k = meta.instruments.find((i) => i.id === id)?.kind
  if (k === 'notice' || k === 'application') return k
  return 'pleading'
}

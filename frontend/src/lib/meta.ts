/**
 * Practice areas, languages and instruments from GET /v1/meta (rules/practice_areas.yaml).
 * Fetched once per page load and shared by every screen.
 */
import { useEffect, useState } from 'react'
import type { Meta, PracticeArea } from './types'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/v1'

const FALLBACK: Meta = {
  areas: [
    { id: 'property', label: 'Civil — Property & Title', tag: 'PROP', group: 'Civil', forum: 'Civil Judge Senior Division', limitation: { years: 12 }, commercial_court: false, adr_routes: [], instruments: ['legal_notice', 'plaint'], statutes: [] },
    { id: 'civil_recovery', label: 'Civil — Money Recovery', tag: 'CIV', group: 'Civil', forum: 'Civil Judge Senior Division', limitation: { years: 3 }, commercial_court: false, adr_routes: [], instruments: ['legal_notice', 'plaint'], statutes: [] },
    { id: 'criminal', label: 'Criminal — Plea & Bail', tag: 'CRIM', group: 'Criminal', forum: 'Judicial Magistrate First Class', limitation: { years: null }, commercial_court: false, adr_routes: [], instruments: ['plea_application'], statutes: [] },
  ],
  languages: [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'Hindi' },
    { code: 'kok', label: 'Konkani' },
    { code: 'mr', label: 'Marathi' },
  ],
  instruments: [],
}

let cache: Meta | null = null
let inflight: Promise<Meta> | null = null
const subs = new Set<(m: Meta) => void>()

export function loadMeta(): Promise<Meta> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch(`${BASE}/meta`)
      .then((r) => (r.ok ? (r.json() as Promise<Meta>) : FALLBACK))
      .catch(() => FALLBACK)
      .then((m) => {
        cache = m
        subs.forEach((fn) => fn(m))
        return m
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

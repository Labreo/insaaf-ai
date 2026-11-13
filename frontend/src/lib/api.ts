/**
 * API client. Real backend first (docs/API_CONTRACT.md).
 *
 * If the backend is unreachable, calls fall through to the local engine in ./store.ts so the
 * app keeps working on a phone with no network (hackathon rule: never spin, never blank).
 * Set VITE_API_BASE to point at the FastAPI server; set VITE_FORCE_LOCAL=true to skip probing.
 */
import { useSyncExternalStore } from 'react'
import type {
  AccessLogEntry, Advice, Alert, BiasFirewall, CaseType, CitationHealth, Draft, Fact, Identity, LawChange, Ledger, LedgerEntry,
  Matter, MatterDocument, Me, ModelInfo, PipelineEvent, Precedents, ProofItem, QueueItem, ReviewInput, Role, Score, SourceRef, StatuteClock,
} from './types'
import { getDB, mut, q, scanLaw } from './store'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/v1'
const FORCE_LOCAL = import.meta.env.VITE_FORCE_LOCAL === 'true'

/* ---------------------------------------------------------------- connection state */

export type Conn = 'probing' | 'live' | 'local'
let conn: Conn = FORCE_LOCAL ? 'local' : 'probing'
const connListeners = new Set<() => void>()
function setConn(c: Conn) { if (c !== conn) { conn = c; connListeners.forEach((l) => l()) } }
export function useConnection(): Conn {
  return useSyncExternalStore((l) => { connListeners.add(l); return () => connListeners.delete(l) }, () => conn, () => conn)
}

async function probe() {
  if (FORCE_LOCAL) return
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 8000)
    const r = await fetch(`${BASE}/health/deep`, { signal: ctl.signal })
    clearTimeout(t)
    setConn(r.ok ? 'live' : 'local')
  } catch { setConn('local') }
}
probe()
if (!FORCE_LOCAL) setInterval(probe, 30_000)

async function live<T>(path: string, init?: RequestInit): Promise<T> {
  const me = getDB().me
  const authHeaders: Record<string, string> = { 'X-Actor': me.user_id, 'X-Role': me.role }
  const headers = init?.body instanceof FormData ? authHeaders : { 'Content-Type': 'application/json', ...authHeaders }
  const res = await fetch(BASE + path, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

/** Try the backend; on any failure use the local engine and flag the connection as local. */
async function withFallback<T>(remote: () => Promise<T>, local: () => T | Promise<T>): Promise<T> {
  if (FORCE_LOCAL) return local()
  try { const v = await remote(); setConn('live'); return v } catch { setConn('local'); return local() }
}

/* ---------------------------------------------------------------- api */

export const api = {
  me: () => withFallback<Me>(() => live('/me'), () => q.me()),
  setRole: (role: Role) => withFallback<void>(async () => { await live('/me/role', { method: 'POST', body: JSON.stringify({ role }) }); mut.setRole(role) }, () => mut.setRole(role)),

  matters: () => withFallback<Matter[]>(async () => { const list = await live<Matter[]>('/matters'); mut.syncMatters(list); return list }, () => q.matters()),
  matter: (id: string) => withFallback<Matter | undefined>(async () => { const m = await live<Matter>(`/matters/${id}`); mut.syncMatters([m]); return m }, () => q.matter(id)),
  queue: () => withFallback<QueueItem[]>(() => live('/queue'), () => q.queue()),
  alerts: () => withFallback<Alert[]>(() => live('/alerts'), () => q.alerts()),

  createMatter: (input: { title: string; case_type: CaseType; client_language?: Matter['client_language']; forum_hint?: string }) =>
    withFallback<Matter>(async () => { const m = await live<Matter>('/matters', { method: 'POST', body: JSON.stringify(input) }); mut.syncMatter(m); return m }, () => mut.createMatter(input)),
  addDocument: (id: string, file: File) =>
    withFallback<MatterDocument>(async () => { const fd = new FormData(); fd.append('file', file); const d = await live<MatterDocument>(`/matters/${id}/documents`, { method: 'POST', body: fd }); mut.syncDoc(id, d); return d }, () => mut.addDocument(id, file)),
  removeDocument: (id: string, docId: string) =>
    withFallback<void>(async () => { await live(`/matters/${id}/documents/${docId}`, { method: 'DELETE' }); mut.removeDocument(id, docId) }, () => mut.removeDocument(id, docId)),
  deleteMatter: (id: string) => withFallback<void>(async () => { await live(`/matters/${id}`, { method: 'DELETE' }); mut.deleteMatter(id) }, () => mut.deleteMatter(id)),

  facts: (id: string) => withFallback<Fact[]>(async () => { const v = await live<Fact[]>(`/matters/${id}/facts`); mut.syncStageField(id, 'facts', v); return v }, () => q.stage(id)?.facts ?? []),
  proofLedger: (id: string) => withFallback<{ case_type: string; items: ProofItem[] } | undefined>(async () => { const v = await live<{ case_type: string; items: ProofItem[] }>(`/matters/${id}/proof-ledger`); mut.syncStageField(id, 'proof', v); return v }, () => q.stage(id)?.proof),
  statuteClock: (id: string) => withFallback<StatuteClock | undefined>(async () => { const v = await live<StatuteClock>(`/matters/${id}/statute-clock`); mut.syncStageField(id, 'clock', v); return v }, () => q.stage(id)?.clock),
  recalculateClock: (id: string, causeDate: string) =>
    withFallback<StatuteClock>(async () => {
      const v = await live<StatuteClock>(`/matters/${id}/statute-clock/recalculate`, { method: 'POST', body: JSON.stringify({ cause_date: causeDate }) })
      mut.syncStageField(id, 'clock', v)
      return v
    }, () => mut.recalculateClock(id, causeDate)),
  precedents: (id: string) => withFallback<Precedents | undefined>(async () => { const v = await live<Precedents>(`/matters/${id}/precedents`); mut.syncStageField(id, 'precedents', v); return v }, () => q.stage(id)?.precedents),
  searchPrecedents: (id: string, query: string) =>
    withFallback<Precedents>(async () => {
      const v = await live<Precedents>(`/matters/${id}/precedents/search`, { method: 'POST', body: JSON.stringify({ query }) })
      mut.syncStageField(id, 'precedents', v)
      return v
    }, () => mut.searchPrecedents(id, query)),
  citationHealth: (id: string) => withFallback<CitationHealth[]>(async () => { const v = await live<CitationHealth[]>(`/matters/${id}/citations/health`); mut.syncStageField(id, 'citations', v); return v }, () => q.stage(id)?.citations ?? []),
  score: (id: string) => withFallback<Score | undefined>(async () => { const v = await live<Score>(`/matters/${id}/score`); mut.syncStageField(id, 'score', v); return v }, () => q.stage(id)?.score),
  biasFirewall: (id: string) => withFallback<BiasFirewall | undefined>(async () => { const v = await live<BiasFirewall>(`/matters/${id}/bias-firewall`); mut.syncStageField(id, 'bias', v); return v }, () => q.stage(id)?.bias),
  advice: (id: string) => withFallback<Advice | undefined>(async () => { const v = await live<Advice>(`/matters/${id}/advice`); mut.syncStageField(id, 'advice', v); return v }, () => q.stage(id)?.advice),
  draft: (id: string) => withFallback<Draft | undefined>(async () => { const v = await live<Draft>(`/matters/${id}/draft`); mut.syncStageField(id, 'draft', v); return v }, () => q.stage(id)?.draft),
  lawChanges: (id: string) => withFallback<LawChange[]>(() => live(`/matters/${id}/law-changes`), () => q.lawChanges(id)),
  scanLaw: (text: string, offenceDate?: string) => withFallback<LawChange[]>(() => live('/law-changes/scan', { method: 'POST', body: JSON.stringify({ text, offence_date: offenceDate }) }), () => scanLaw(text, offenceDate)),

  flip: (id: string, identity: Identity) =>
    withFallback<{ identity: Identity; score: number; delta: number }>(() => live(`/matters/${id}/bias-firewall/flip`, { method: 'POST', body: JSON.stringify({ identity }) }), () => mut.flip(id, identity)),
  verifyCitation: (id: string, text: string) =>
    withFallback<{ verified: boolean; source?: SourceRef; message: string }>(async () => {
      const res = await live<{ verified: boolean; source?: SourceRef; message: string }>(`/matters/${id}/draft/verify-citation`, { method: 'POST', body: JSON.stringify({ text }) })
      if (res.verified && res.source) mut.syncVerifiedParagraph(id, text, res.source)
      return res
    }, () => mut.verifyCitation(id, text)),

  review: (id: string, input: ReviewInput) =>
    withFallback<LedgerEntry>(async () => {
      const entry = await live<LedgerEntry>(`/matters/${id}/reviews`, { method: 'POST', body: JSON.stringify(input) })
      await mut.review(id, input)
      return entry
    }, () => mut.review(id, input)),
  ledger: (matterId?: string) => withFallback<Ledger>(async () => {
    const res = await live<Ledger>(`/ledger${matterId && matterId !== 'all' ? `?matter_id=${matterId}` : ''}`)
    if (!matterId || matterId === 'all') mut.syncLedger(res.entries)
    return res
  }, () => q.ledger(matterId)),
  model: () => withFallback<ModelInfo>(async () => { const m = await live<ModelInfo>('/ml/model'); mut.syncModel(m); return m }, () => q.model()),
  accessLogs: () => withFallback<AccessLogEntry[]>(() => live('/access-logs'), () => []),
  retrain: () => withFallback(async () => {
    const res = await live<Awaited<ReturnType<typeof mut.retrain>>>('/ml/retrain', { method: 'POST' })
    await mut.retrain()
    return res
  }, () => mut.retrain()),

  /** Pipeline as a stream. Live: SSE from the backend. Local: the engine's generator. */
  async *pipeline(id: string): AsyncGenerator<PipelineEvent> {
    if (conn !== 'local') {
      try {
        const res = await fetch(`${BASE}/matters/${id}/events`)
        if (!res.ok || !res.body) throw new Error('no stream')
        setConn('live')
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) {
            mut.ensureStage(id)
            live<Matter>(`/matters/${id}`).then((m) => mut.syncMatter(m)).catch(() => {})
            return
          }
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n\n'); buf = parts.pop() ?? ''
          for (const p of parts) if (p.startsWith('data:')) yield JSON.parse(p.slice(5)) as PipelineEvent
        }
      } catch { setConn('local') }
    }
    yield* mut.runPipeline(id)
  },
}

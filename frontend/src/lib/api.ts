/**
 * Live API client targeting FastAPI (/v1/*). Every read and mutation talks
 * directly to the backend; no mock fallbacks.
 */
import { bumpRev, getDB, patchStore } from './store'
import type {
  AccessLogEntry,
  Advice,
  Alert,
  BiasFirewall,
  CaseType,
  CitationHealth,
  DeepHealth,
  Draft,
  Fact,
  Identity,
  LawChange,
  Ledger,
  LedgerEntry,
  Matter,
  MatterDocument,
  Me,
  ModelInfo,
  PipelineEvent,
  Precedents,
  ProofItem,
  QueueItem,
  RetrainResult,
  ReviewInput,
  Role,
  Score,
  SourceRef,
  StatuteClock,
} from './types'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/v1'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { me } = getDB()
  const authHeaders: Record<string, string> = {
    'X-Actor': me.user_id,
    'X-Role': me.role,
  }
  const headers =
    init?.body instanceof FormData
      ? authHeaders
      : { 'Content-Type': 'application/json', ...authHeaders }

  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const msg = text || `${res.status} ${res.statusText}`
    if (res.status >= 500) {
      patchStore({ error: msg })
    }
    throw new Error(`${res.status} ${path}: ${msg}`)
  }

  patchStore({ conn: 'live', error: null })
  return res.json() as Promise<T>
}

export const api = {
  async bootstrap(): Promise<void> {
    try {
      const meRes = await fetch(`${BASE}/me`, { headers: { 'X-Actor': getDB().me.user_id } })
      if (!meRes.ok) throw new Error(`${meRes.status} /me`)
      const me = (await meRes.json()) as Me
      patchStore({ me })
      const [matters, health] = await Promise.all([
        req<Matter[]>('/matters'),
        req<DeepHealth>('/health/deep'),
      ])
      patchStore({ me, matters, health, conn: 'live', error: null })
    } catch (e) {
      patchStore({ conn: 'down', error: e instanceof Error ? e.message : String(e) })
    }
  },

  health: async () => {
    const h = await req<DeepHealth>('/health/deep')
    patchStore({ health: h })
    return h
  },

  me: async () => {
    const m = await req<Me>('/me')
    patchStore({ me: m })
    return m
  },

  setRole: async (role: Role) => {
    const res = await req<{ role: Role }>('/me/role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    })
    patchStore({ me: { ...getDB().me, role: res.role } })
    const m = await req<Me>('/me')
    patchStore({ me: m })
    bumpRev()
  },

  matters: async () => {
    const list = await req<Matter[]>('/matters')
    patchStore({ matters: list })
    return list
  },

  matter: async (id: string) => {
    const m = await req<Matter>(`/matters/${id}`)
    const prev = getDB().matters
    const exists = prev.some((x) => x.id === m.id)
    patchStore({
      matters: exists ? prev.map((x) => (x.id === m.id ? m : x)) : [m, ...prev],
    })
    return m
  },

  createMatter: async (input: {
    title: string
    case_type: CaseType
    client_language?: Matter['client_language']
    forum_hint?: string
  }) => {
    const m = await req<Matter>('/matters', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    const list = await req<Matter[]>('/matters')
    patchStore({ matters: list })
    bumpRev()
    return m
  },

  deleteMatter: async (id: string) => {
    await req<{ deleted: string }>(`/matters/${id}`, { method: 'DELETE' })
    const list = await req<Matter[]>('/matters')
    patchStore({ matters: list })
    bumpRev()
  },

  addDocument: async (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const doc = await req<MatterDocument>(`/matters/${id}/documents`, {
      method: 'POST',
      body: fd,
    })
    await api.matter(id)
    bumpRev()
    return doc
  },

  removeDocument: async (id: string, docId: string) => {
    await req<{ deleted: string }>(`/matters/${id}/documents/${docId}`, {
      method: 'DELETE',
    })
    await api.matter(id)
    bumpRev()
  },

  queue: () => req<QueueItem[]>('/queue'),
  alerts: () => req<Alert[]>('/alerts'),

  facts: (id: string) => req<Fact[]>(`/matters/${id}/facts`),
  proofLedger: (id: string) =>
    req<{ case_type: string; items: ProofItem[] }>(`/matters/${id}/proof-ledger`),
  statuteClock: (id: string) => req<StatuteClock>(`/matters/${id}/statute-clock`),
  recalculateClock: async (id: string, causeDate: string) => {
    const clock = await req<StatuteClock>(`/matters/${id}/statute-clock/recalculate`, {
      method: 'POST',
      body: JSON.stringify({ cause_date: causeDate }),
    })
    await api.matters()
    bumpRev()
    return clock
  },
  precedents: (id: string) => req<Precedents>(`/matters/${id}/precedents`),
  searchPrecedents: async (id: string, query: string) => {
    const res = await req<Precedents>(`/matters/${id}/precedents/search`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    })
    bumpRev()
    return res
  },
  citationHealth: (id: string) => req<CitationHealth[]>(`/matters/${id}/citations/health`),
  checkCitation: async (id: string, citation: string) => {
    const res = await req<CitationHealth[]>(`/matters/${id}/citations/check`, {
      method: 'POST',
      body: JSON.stringify({ citation }),
    })
    bumpRev()
    return res
  },
  score: (id: string) => req<Score>(`/matters/${id}/score`),
  setCourt: async (id: string, court: string) => {
    const res = await req<Score>(`/matters/${id}/court`, {
      method: 'POST',
      body: JSON.stringify({ court }),
    })
    await api.matter(id)
    bumpRev()
    return res
  },
  toggleFlag: async (id: string, flag: 'senior_citizen' | 'interim_relief' | 'undertrial_custody') => {
    const res = await req<QueueItem[]>(`/matters/${id}/flags`, {
      method: 'POST',
      body: JSON.stringify({ flag }),
    })
    bumpRev()
    return res
  },
  biasFirewall: (id: string) => req<BiasFirewall>(`/matters/${id}/bias-firewall`),
  flip: (id: string, identity: Identity) =>
    req<{ identity: Identity; score: number; delta: number }>(
      `/matters/${id}/bias-firewall/flip`,
      { method: 'POST', body: JSON.stringify({ identity }) },
    ),
  advice: (id: string) => req<Advice>(`/matters/${id}/advice`),
  draft: (id: string) => req<Draft>(`/matters/${id}/draft`),
  setDraftType: async (id: string, draftType: 'legal_notice' | 'plaint' | 'plea_application') => {
    const res = await req<Draft>(`/matters/${id}/draft/type`, {
      method: 'POST',
      body: JSON.stringify({ draft_type: draftType }),
    })
    bumpRev()
    return res
  },
  verifyCitation: async (id: string, text: string) => {
    const res = await req<{ verified: boolean; source?: SourceRef; message: string }>(
      `/matters/${id}/draft/verify-citation`,
      { method: 'POST', body: JSON.stringify({ text }) },
    )
    if (res.verified) bumpRev()
    return res
  },
  exportDraftUrl: (id: string) => `${BASE}/matters/${id}/draft/export?format=docx`,

  lawChanges: (id: string) => req<LawChange[]>(`/matters/${id}/law-changes`),
  scanLaw: (text: string, offenceDate?: string) =>
    req<LawChange[]>('/law-changes/scan', {
      method: 'POST',
      body: JSON.stringify({ text, offence_date: offenceDate }),
    }),

  review: async (id: string, input: ReviewInput) => {
    const entry = await req<LedgerEntry>(`/matters/${id}/reviews`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await api.matters()
    bumpRev()
    return entry
  },

  ledger: (matterId?: string) =>
    req<Ledger>(
      `/ledger${matterId && matterId !== 'all' ? `?matter_id=${encodeURIComponent(matterId)}` : ''}`,
    ),

  tamperLedger: async () => {
    const res = await req<{ tampered: boolean; broken_at: string | null }>(
      '/ledger/tamper',
      { method: 'POST' },
    )
    bumpRev()
    return res
  },

  model: () => req<ModelInfo>('/ml/model'),
  retrain: async () => {
    const res = await req<RetrainResult>('/ml/retrain', { method: 'POST' })
    bumpRev()
    return res
  },

  accessLogs: () => req<AccessLogEntry[]>('/access-logs'),

  resetDemo: async () => {
    await req<{ reset: boolean }>('/demo/reset', { method: 'POST' })
    await api.bootstrap()
    bumpRev()
  },

  async *pipeline(id: string): AsyncGenerator<PipelineEvent> {
    await req<{ job_id: string }>(`/matters/${id}/run`, { method: 'POST' })
    const res = await fetch(`${BASE}/matters/${id}/events`)
    if (!res.ok || !res.body) {
      throw new Error(`Failed to open SSE stream (${res.status})`)
    }
    patchStore({ conn: 'live', error: null })
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (line.startsWith('data:')) {
            yield JSON.parse(line.slice(5).trim()) as PipelineEvent
          }
        }
      }
    }
    await api.matters()
    bumpRev()
  },
}

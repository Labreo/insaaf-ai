/**
 * Live API client targeting FastAPI (/v1/*). Every read and mutation talks
 * directly to the backend; no mock fallbacks.
 *
 * Auth: every protected call carries `Authorization: Bearer <token>`. Identity is
 * never sent as a header the server trusts. A 401 clears the local session and
 * reopens the sign-in dialog.
 */
import { bumpRev, clearSession, closeAuth, getDB, patchStore, playIntro } from './store'
import type {
  AccessLogEntry,
  Advice,
  Alert,
  AuthAccount,
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
  OrgMemberRow,
  PipelineEvent,
  PrecedentDetail,
  PrecedentExploreResult,
  Precedents,
  ProofItem,
  QueueItem,
  RetrainResult,
  ReviewInput,
  Score,
  SourceRef,
  StatuteClock,
  TamperResult,
} from './types'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/v1'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function authHeaders(token: string | null = getDB().token): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function toApiError(res: Response, path: string): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  let code = `http_${res.status}`
  let message = text || `${res.status} ${res.statusText}`
  try {
    const err = JSON.parse(text)?.detail?.error
    if (err?.code) code = err.code
    if (err?.message) message = err.message
  } catch {
    // non-JSON body
  }
  return new ApiError(res.status, code, `${message} (${path})`)
}

const SESSION_NOTICE: Record<string, string> = {
  session_expired: 'Your session expired. Sign in again to continue.',
  session_revoked: 'You were signed out. Sign in again to continue.',
}

/** Authenticated fetch. Returns the raw Response for streams and file downloads. */
async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const isForm = init?.body instanceof FormData
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(isForm || !init?.body ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 401 && getDB().token) {
    const err = await toApiError(res, path)
    clearSession(SESSION_NOTICE[err.code] ?? 'Sign in to continue.')
    throw err
  }
  if (!res.ok) {
    const err = await toApiError(res, path)
    if (res.status >= 500) patchStore({ error: err.message })
    throw err
  }
  patchStore({ conn: 'live', error: null })
  return res
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init)
  return res.json() as Promise<T>
}

async function loadTenantData() {
  const [matters, health] = await Promise.all([req<Matter[]>('/matters'), api.health()])
  patchStore({ matters, health, conn: 'live', error: null })
}

export const api = {
  /** Restore a saved session if it is still valid; otherwise land signed out. */
  async bootstrap(): Promise<void> {
    try {
      await api.health()
    } catch (e) {
      patchStore({ conn: 'down', error: e instanceof Error ? e.message : String(e) })
    }
    if (!getDB().token) {
      patchStore({ authed: false, authReady: true })
      return
    }
    try {
      const me = await req<Me>('/me')
      patchStore({ me, authed: true, authReady: true })
      await loadTenantData()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return // clearSession already ran
      patchStore({ authReady: true, conn: 'down', error: e instanceof Error ? e.message : String(e) })
    }
  },

  accounts: () => req<AuthAccount[]>('/auth/accounts'),

  /** Sign in (or switch account). The previous session, if any, is revoked server-side. */
  login: async (payload: { user_id?: string; email?: string; password: string }) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw await toApiError(res, '/auth/login')
    const body = (await res.json()) as { token: string; expires_at: number; me: Me }
    const previous = getDB().token
    if (previous && previous !== body.token) {
      // Best effort: an unreachable logout must not block the new sign-in.
      fetch(`${BASE}/auth/logout`, { method: 'POST', headers: authHeaders(previous) }).catch(() => {})
    }
    patchStore({ me: body.me, token: body.token, authed: true, authReady: true, matters: [] })
    closeAuth()
    playIntro(previous ? 'switch' : 'login')
    await loadTenantData()
    bumpRev()
    return body.me
  },

  /** Create a new chamber with the caller as its senior advocate, and sign in. */
  signup: async (payload: { name: string; email: string; password: string; chamber_name: string; city?: string }) => {
    const res = await fetch(`${BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw await toApiError(res, '/auth/signup')
    const body = (await res.json()) as { token: string; expires_at: number; me: Me }
    const previous = getDB().token
    if (previous && previous !== body.token) {
      fetch(`${BASE}/auth/logout`, { method: 'POST', headers: authHeaders(previous) }).catch(() => {})
    }
    patchStore({ me: body.me, token: body.token, authed: true, authReady: true, matters: [] })
    closeAuth()
    playIntro(previous ? 'switch' : 'login')
    await loadTenantData()
    bumpRev()
    return body.me
  },

  members: () => req<OrgMemberRow[]>('/org/members'),
  addMember: (payload: { name: string; email: string; role: 'junior' | 'clerk' | 'student' }) =>
    req<{ user_id: string; email: string; name: string; role: string; temporary_password: string }>('/org/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  logout: async () => {
    const { token } = getDB()
    if (token) {
      await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: authHeaders(token) }).catch(() => {})
    }
    clearSession()
  },

  /** Public, unauthenticated. */
  health: async () => {
    const res = await fetch(`${BASE}/health/deep`)
    if (!res.ok) throw await toApiError(res, '/health/deep')
    const h = (await res.json()) as DeepHealth
    patchStore({ health: h, conn: 'live' })
    return h
  },

  me: async () => {
    const m = await req<Me>('/me')
    patchStore({ me: m })
    return m
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
    client_language?: string
    forum_hint?: string
    state?: string
    district?: string
    court_seat?: string
    cause_date?: string
    client_name?: string
    opposite_party?: string
    summary?: string
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

  updateMatter: async (id: string, patch: Partial<Matter>) => {
    const m = await req<Matter>(`/matters/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    const prev = getDB().matters
    patchStore({ matters: prev.map((x) => (x.id === m.id ? m : x)) })
    bumpRev()
    return m
  },

  setLanguage: async (id: string, language: string) => {
    const m = await req<Matter>(`/matters/${id}/language`, { method: 'POST', body: JSON.stringify({ language }) })
    const prev = getDB().matters
    patchStore({ matters: prev.map((x) => (x.id === m.id ? m : x)) })
    bumpRev()
    return m
  },

  translate: (text: string, source: string, target = 'en') =>
    req<{ text: string; engine: string; confidence: string }>('/translate', {
      method: 'POST',
      body: JSON.stringify({ text, source, target }),
    }),

  retranscribe: async (id: string, docId: string) => {
    const res = await req<{ status: string; original_text: string; english_translation: string }>(
      `/matters/${id}/documents/${docId}/transcribe`,
      { method: 'POST' },
    )
    await api.matter(id)
    bumpRev()
    return res
  },

  /** Voice-note audio as an object URL (needs the bearer token, so no plain <audio src>). */
  audioUrl: async (id: string, docId: string): Promise<string> => {
    const res = await authFetch(`/matters/${id}/documents/${docId}/audio`)
    return URL.createObjectURL(await res.blob())
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
  sendTestAlert: (matterId?: string) =>
    req<{ sent: boolean; matter_id: string; title: string; channel: string; days_left: number }>(
      `/alerts/test${matterId ? `?matter_id=${encodeURIComponent(matterId)}` : ''}`,
      { method: 'POST' },
    ),

  facts: (id: string) => req<Fact[]>(`/matters/${id}/facts`),
  proofLedger: (id: string) =>
    req<{ case_type: string; items: ProofItem[] }>(`/matters/${id}/proof-ledger`),
  statuteClock: (id: string) => req<StatuteClock>(`/matters/${id}/statute-clock`),
  /** preview=true computes without changing the matter; preview=false saves the date and deadline. */
  recalculateClock: async (id: string, causeDate: string, preview = false) => {
    const clock = await req<StatuteClock>(`/matters/${id}/statute-clock/recalculate`, {
      method: 'POST',
      body: JSON.stringify({ cause_date: causeDate, preview }),
    })
    if (!preview) {
      await api.matters()
      bumpRev()
    }
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
  setDraftType: async (id: string, draftType: string, instructions?: string) => {
    const res = await req<Draft>(`/matters/${id}/draft/type`, {
      method: 'POST',
      body: JSON.stringify({ draft_type: draftType, instructions }),
    })
    bumpRev()
    return res
  },
  regenerateDraft: async (id: string, instructions?: string) => {
    const res = await req<Draft>(`/matters/${id}/draft/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ draft_type: '', instructions }),
    })
    bumpRev()
    return res
  },
  editDraftParagraph: async (id: string, paragraphId: string, text: string | null) => {
    const res = await req<Draft>(`/matters/${id}/draft`, {
      method: 'PATCH',
      body: JSON.stringify({ paragraph_id: paragraphId, text }),
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
  /** DOCX / PDF download with the bearer token (a plain link cannot carry it). */
  exportDraft: async (id: string, format: 'docx' | 'pdf' = 'docx'): Promise<{ blob: Blob; filename: string }> => {
    const res = await authFetch(`/matters/${id}/draft/export?format=${format}`)
    const cd = res.headers.get('Content-Disposition') ?? ''
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${id}_draft.${format}`
    return { blob: await res.blob(), filename }
  },

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

  explorePrecedents: (body: {
    query: string
    area?: string
    state?: string
    district?: string
    court?: string
    outcome?: string
    limit?: number
  }) =>
    req<PrecedentExploreResult>('/precedents/search', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getPrecedent: (docId: string) =>
    req<PrecedentDetail>(`/precedents/${encodeURIComponent(docId)}`),

  tamperLedger: async () => {
    const res = await req<TamperResult>(
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
    await loadTenantData()
    bumpRev()
  },

  async *pipeline(id: string, live = false): AsyncGenerator<PipelineEvent> {
    await req<{ job_id: string }>(`/matters/${id}/run`, { method: 'POST' })
    const res = await authFetch(`/matters/${id}/events${live ? '?live=true' : ''}`)
    if (!res.body) {
      throw new Error('Failed to open pipeline event stream')
    }
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

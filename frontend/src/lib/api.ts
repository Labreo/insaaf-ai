// One switch between mocks and the real backend.
// Every function returns the exact shapes in docs/API_CONTRACT.md.
import type {
  Advice, BiasFirewall, CitationHealth, Draft, Fact, Identity, Ledger, Matter,
  PipelineEvent, Precedents, ProofItem, QueueItem, Score, SourceRef, StatuteClock,
} from './types'

import matters from '@mocks/matters.json'
import pipelineEvents from '@mocks/pipeline_events.json'
import facts from '@mocks/facts.json'
import proofLedger from '@mocks/proof_ledger.json'
import statuteClock from '@mocks/statute_clock.json'
import precedents from '@mocks/precedents.json'
import citationHealth from '@mocks/citation_health.json'
import score from '@mocks/score.json'
import biasFirewall from '@mocks/bias_firewall.json'
import advice from '@mocks/advice.json'
import draft from '@mocks/draft.json'
import ledger from '@mocks/ledger.json'
import queue from '@mocks/queue.json'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'
const BASE = import.meta.env.VITE_API_BASE ?? '/v1'

async function real<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const api = {
  matters: async (): Promise<Matter[]> => (USE_MOCKS ? (matters as Matter[]) : real('/matters')),
  matter: async (id: string): Promise<Matter | undefined> =>
    USE_MOCKS ? (matters as Matter[]).find((m) => m.id === id) : real(`/matters/${id}`),
  queue: async (): Promise<QueueItem[]> => (USE_MOCKS ? (queue as QueueItem[]) : real('/queue')),

  facts: async (id: string): Promise<Fact[]> => (USE_MOCKS ? (facts as Fact[]) : real(`/matters/${id}/facts`)),
  proofLedger: async (id: string): Promise<{ case_type: string; items: ProofItem[] }> =>
    USE_MOCKS ? (proofLedger as { case_type: string; items: ProofItem[] }) : real(`/matters/${id}/proof-ledger`),
  statuteClock: async (id: string): Promise<StatuteClock> =>
    USE_MOCKS ? (statuteClock as StatuteClock) : real(`/matters/${id}/statute-clock`),
  precedents: async (id: string): Promise<Precedents> =>
    USE_MOCKS ? (precedents as Precedents) : real(`/matters/${id}/precedents`),
  citationHealth: async (id: string): Promise<CitationHealth[]> =>
    USE_MOCKS ? (citationHealth as CitationHealth[]) : real(`/matters/${id}/citations/health`),
  score: async (id: string): Promise<Score> => (USE_MOCKS ? (score as Score) : real(`/matters/${id}/score`)),
  biasFirewall: async (id: string): Promise<BiasFirewall> =>
    USE_MOCKS ? (biasFirewall as BiasFirewall) : real(`/matters/${id}/bias-firewall`),
  advice: async (id: string): Promise<Advice> => (USE_MOCKS ? (advice as Advice) : real(`/matters/${id}/advice`)),
  draft: async (id: string): Promise<Draft> => (USE_MOCKS ? (draft as Draft) : real(`/matters/${id}/draft`)),
  ledger: async (id: string): Promise<Ledger> => (USE_MOCKS ? (ledger as Ledger) : real(`/ledger?matter_id=${id}`)),

  /** Live flip test. In mock mode we jitter within epsilon so the UI shows a real re-run. */
  flip: async (id: string, identity: Identity): Promise<{ identity: Identity; score: number; delta: number }> => {
    if (!USE_MOCKS) return real(`/matters/${id}/bias-firewall/flip`, { method: 'POST', body: JSON.stringify({ identity }) })
    await wait(650)
    const base = (biasFirewall as BiasFirewall).rows[0].score
    const delta = identity === 'baseline' ? 0 : Math.round((Math.random() * 0.012) * 100) / 100
    return { identity, score: Math.round((base - delta) * 100) / 100, delta }
  },

  /** Authority Lock. Mock: only exact mock source titles verify. */
  verifyCitation: async (id: string, text: string): Promise<{ verified: boolean; source?: SourceRef; message: string }> => {
    if (!USE_MOCKS) return real(`/matters/${id}/draft/verify-citation`, { method: 'POST', body: JSON.stringify({ text }) })
    await wait(900)
    const pool: SourceRef[] = (draft as Draft).paragraphs.flatMap((p) => p.sources)
    const hit = pool.find((s) => text.toLowerCase().includes(s.title.toLowerCase().split(' v. ')[0].toLowerCase()))
    return hit
      ? { verified: true, source: hit, message: 'Verified against stored paragraph.' }
      : { verified: false, message: 'No verified authority found.' }
  },

  /** Replays the pipeline as a stream so the stage rail animates like SSE. */
  async *pipeline(id: string): AsyncGenerator<PipelineEvent> {
    if (!USE_MOCKS) {
      const res = await fetch(`${BASE}/matters/${id}/events`)
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n'); buf = parts.pop() ?? ''
        for (const p of parts) if (p.startsWith('data:')) yield JSON.parse(p.slice(5)) as PipelineEvent
      }
    }
    const stages = (pipelineEvents as PipelineEvent[]).map((e) => e.stage)
    for (const stage of stages) {
      const src = (pipelineEvents as PipelineEvent[]).find((e) => e.stage === stage)!
      yield { ...src, status: 'running', progress: 0, message: 'Starting…' }
      const steps = stage === 'search' ? 8 : 3
      const total = stage === 'search' ? 7400 : Math.max(500, src.elapsed_ms / 3)
      for (let i = 1; i <= steps; i++) {
        await wait(total / steps)
        const progress = i / steps
        const msg = stage === 'search' ? `Searched ${Math.round(20 * progress)} of 20 judgments` : src.message
        yield { ...src, status: 'running', progress, message: msg }
      }
      yield { ...src, status: 'done', progress: 1 }
    }
  },
}

/**
 * Reactive client store backed exclusively by the live FastAPI backend (/v1/*).
 * Zero mock data or client-side fallback engines.
 */
import { useSyncExternalStore } from 'react'
import type { DeepHealth, Matter, Me } from './types'

export type ConnState = 'probing' | 'live' | 'down'

export interface StoreState {
  me: Me
  matters: Matter[]
  health: DeepHealth | null
  conn: ConnState
  error: string | null
  pushEnabled: boolean
  rev: number
}

const initialMe: Me = {
  user_id: 'junior_1',
  name: 'Adv. Kanak',
  role: 'junior',
  org: { id: 'org_chamber_a', name: 'Chamber A — Goa', plan: 'chamber', members: [] },
}

let state: StoreState = {
  me: initialMe,
  matters: [],
  health: null,
  conn: 'probing',
  error: null,
  pushEnabled: true,
  rev: 0,
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function getDB(): StoreState {
  return state
}

export function useDB<T>(sel: (s: StoreState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sel(state),
    () => sel(state),
  )
}

export function patchStore(partial: Partial<StoreState>) {
  state = { ...state, ...partial }
  emit()
}

export function bumpRev() {
  state = { ...state, rev: state.rev + 1 }
  emit()
}

export function setPushEnabled(pushEnabled: boolean) {
  state = { ...state, pushEnabled }
  emit()
}

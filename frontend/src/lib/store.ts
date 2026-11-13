/**
 * Reactive client store backed exclusively by the live FastAPI backend (/v1/*).
 * Zero mock data or client-side fallback engines.
 *
 * Session: the signed Bearer token lives in localStorage under TOKEN_KEY and is
 * attached to every request by api.ts. It is never rendered; the UI shows only
 * the server-provided session fingerprint.
 */
import { useSyncExternalStore } from 'react'
import type { DeepHealth, Matter, Me } from './types'

export type ConnState = 'probing' | 'live' | 'down'

const TOKEN_KEY = 'insaaf_token'

function readSavedToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null
  } catch {
    return null
  }
}

function writeSavedToken(token: string | null) {
  try {
    if (typeof window === 'undefined') return
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore storage quota / private mode errors
  }
}

export interface StoreState {
  me: Me
  token: string | null
  /** true once /me has confirmed the token for this session */
  authed: boolean
  /** true once bootstrap has decided whether a session exists */
  authReady: boolean
  /** global sign-in / account switcher dialog */
  authModal: { open: boolean; prefill: string | null; notice: string | null }
  matters: Matter[]
  health: DeepHealth | null
  conn: ConnState
  error: string | null
  pushEnabled: boolean
  rev: number
  /** bumped on every sign-in / sign-up / account switch so App replays the intro */
  introNonce: number
}

// Shown only before sign-in. Never used to authorise anything: the backend resolves identity from the token.
export const SIGNED_OUT_ME: Me = {
  user_id: '',
  name: 'Signed out',
  role: 'student',
  org: { id: '', name: 'No chamber', plan: '', members: [] },
  permissions: [],
}

let state: StoreState = {
  me: SIGNED_OUT_ME,
  token: readSavedToken(),
  authed: false,
  authReady: false,
  authModal: { open: false, prefill: null, notice: null },
  matters: [],
  health: null,
  conn: 'probing',
  error: null,
  pushEnabled: true,
  rev: 0,
  introNonce: 0,
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
  if ('token' in partial) {
    writeSavedToken(partial.token ?? null)
  }
  state = { ...state, ...partial }
  emit()
}

export function bumpRev() {
  state = { ...state, rev: state.rev + 1 }
  emit()
}

export function playIntro() {
  state = { ...state, introNonce: state.introNonce + 1 }
  emit()
}

export function setPushEnabled(pushEnabled: boolean) {
  state = { ...state, pushEnabled }
  emit()
}

export function openAuth(opts: { prefill?: string | null; notice?: string | null } = {}) {
  state = { ...state, authModal: { open: true, prefill: opts.prefill ?? null, notice: opts.notice ?? null } }
  emit()
}

export function closeAuth() {
  state = { ...state, authModal: { open: false, prefill: null, notice: null } }
  emit()
}

/** Drop the local session and every piece of tenant data cached from it. */
export function clearSession(notice: string | null = null) {
  writeSavedToken(null)
  state = {
    ...state,
    token: null,
    authed: false,
    authReady: true,
    me: SIGNED_OUT_ME,
    matters: [],
    error: null,
    rev: state.rev + 1,
    authModal: notice ? { open: true, prefill: null, notice } : state.authModal,
  }
  emit()
}

export function can(permission: string): boolean {
  return state.authed && (state.me.permissions ?? []).includes(permission)
}

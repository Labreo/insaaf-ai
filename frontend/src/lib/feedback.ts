/**
 * Tiny feedback bus: toasts and promise-based confirmation dialogs.
 * Toasts report real outcomes only: call `run()` so success is shown after the
 * backend resolves and the backend's own error message is shown when it rejects.
 */
import { useSyncExternalStore } from 'react'

export type ToastTone = 'ok' | 'bad' | 'info'
export interface Toast {
  id: number
  tone: ToastTone
  title: string
  detail?: string
}

export interface ConfirmRequest {
  id: number
  title: string
  body: string
  confirmLabel: string
  tone: 'danger' | 'primary'
  resolve: (ok: boolean) => void
}

let toasts: Toast[] = []
let confirmReq: ConfirmRequest | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(tone: ToastTone, title: string, detail?: string) {
  const id = ++seq
  toasts = [...toasts.slice(-3), { id, tone, title, detail }]
  emit()
  // Errors stay longer so they can be read; success clears itself quickly.
  setTimeout(() => dismissToast(id), tone === 'bad' ? 9000 : 4000)
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Run a backend action: toast success only after it resolves, toast the real error if it throws. */
export async function run<T>(label: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const out = await fn()
    if (success) toast('ok', success)
    return out
  } catch (e) {
    toast('bad', `${label} failed`, errorMessage(e))
    return undefined
  }
}

export function confirmAction(opts: {
  title: string
  body: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq?.resolve(false)
    confirmReq = {
      id: ++seq,
      title: opts.title,
      body: opts.body,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      tone: opts.tone ?? 'danger',
      resolve,
    }
    emit()
  })
}

export function settleConfirm(ok: boolean) {
  const r = confirmReq
  confirmReq = null
  emit()
  r?.resolve(ok)
}

export const useToasts = () =>
  useSyncExternalStore(subscribe, () => toasts, () => toasts)
export const useConfirm = () =>
  useSyncExternalStore(subscribe, () => confirmReq, () => confirmReq)

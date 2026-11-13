import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check, KeyRound, Lock, LogOut, ShieldCheck, UserCheck, X } from 'lucide-react'
import { ApiError, api } from '@/lib/api'
import { closeAuth, useDB } from '@/lib/store'
import type { AuthAccount } from '@/lib/types'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/utils'

/**
 * The one sign-in / account-switch / sign-out dialog. Rendered once in App and
 * opened from anywhere with openAuth(). With `required`, it cannot be dismissed
 * (used when a protected page is opened without a session).
 */
export default function AuthModal({ required = false }: { required?: boolean }) {
  const modal = useDB((s) => s.authModal)
  const authed = useDB((s) => s.authed)
  const me = useDB((s) => s.me)
  const nav = useNavigate()
  const loc = useLocation()
  const open = modal.open || required

  const [accounts, setAccounts] = useState<AuthAccount[]>([])
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const pwRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    api
      .accounts()
      .then((list) => alive && setAccounts(list))
      .catch(() => alive && setAccounts([])) // picker is optional; the form still works
    return () => {
      alive = false
    }
  }, [open])

  // Re-seed the form each time the dialog opens.
  const openKey = `${open}|${modal.prefill ?? ''}`
  const [seededFor, setSeededFor] = useState('')
  if (open && seededFor !== openKey) {
    setSeededFor(openKey)
    setIdentifier(modal.prefill ?? '')
    setPassword('')
    setErr(null)
  }

  if (!open) return null

  const dismiss = () => {
    if (!required) closeAuth()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = identifier.trim()
    if (!id || !password) return
    setBusy(true)
    setErr(null)
    try {
      await api.login(id.includes('@') ? { email: id, password } : { user_id: id, password })
      setPassword('')
      sfx.accept()
      if (loc.pathname === '/') nav('/docket')
    } catch (ex) {
      setErr(
        ex instanceof ApiError && ex.status === 429
          ? 'Too many failed attempts. Wait a few minutes and try again.'
          : ex instanceof ApiError && ex.status === 401
            ? 'Incorrect account or password.'
            : ex instanceof Error
              ? ex.message
              : String(ex),
      )
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    await api.logout()
    setBusy(false)
    sfx.tap()
    nav('/')
  }

  const pick = (acc: AuthAccount) => {
    sfx.tick()
    setIdentifier(acc.user_id)
    setPassword('') // never carry a password from one account to another
    setErr(null)
    pwRef.current?.focus()
  }

  const expires = me.session_expires_at ? new Date(me.session_expires_at * 1000) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Chamber sign in">
      {/* Opaque: the signed-in workspace (other tenant's data) must not show behind a sign-in / switch dialog. */}
      <div className="fixed inset-0 bg-night" onClick={dismiss}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,168,104,0.12),transparent_60%)]" />
      </div>
      <div className="relative z-10 max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-[10px] border border-line-strong bg-surface p-6 text-ink shadow-[var(--shadow-sheet)]">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-brass">
              <ShieldCheck size={12} /> Chamber sign in
            </p>
            <h2 className="mt-1 font-display text-[24px] leading-tight text-ink">
              {authed ? 'Switch account' : 'Sign in to your chamber'}
            </h2>
            {authed ? (
              <p className="mt-1 text-[12px] text-ink-3">
                Signed in as <span className="font-semibold text-ink">{me.name}</span> ({me.role} · {me.org.name})
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-ink-3">Your role and chamber come from your account. They cannot be changed in-session.</p>
            )}
          </div>
          {!required && (
            <button
              type="button"
              aria-label="Close sign in"
              onClick={dismiss}
              className="rounded-[5px] border border-line p-1.5 text-ink-3 hover:bg-hover hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {modal.notice && (
          <div className="mt-4 rounded-[6px] border border-warn-200 bg-warn-50 px-3.5 py-2 text-[12px] text-warn">{modal.notice}</div>
        )}
        {err && (
          <div role="alert" className="mt-4 rounded-[6px] border border-bad-200 bg-bad-50 px-3.5 py-2 text-[12px] text-bad">
            {err}
          </div>
        )}

        {authed && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[7px] border border-line bg-sunken px-4 py-3">
            <div className="font-mono text-[11px] text-ink-3">
              Session <span className="text-ink">{me.session_fingerprint ?? '—'}</span>
              {expires && <> · expires {expires.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>}
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-bad disabled:opacity-50"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Demo accounts</p>
              <span className="font-mono text-[10px] text-ink-3">Pick one, then enter its password</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {accounts.map((acc) => {
                const current = authed && acc.user_id === me.user_id
                const selected = identifier === acc.user_id || identifier.toLowerCase() === acc.email.toLowerCase()
                const isChamberB = acc.org_id !== accounts[0]?.org_id
                return (
                  <button
                    key={acc.user_id}
                    type="button"
                    disabled={busy}
                    onClick={() => pick(acc)}
                    className={cn(
                      'flex flex-col justify-between rounded-[7px] border p-3 text-left transition-colors',
                      selected ? 'border-navy bg-navy-50' : isChamberB ? 'border-brass-200 bg-brass-50/40 hover:bg-brass-50' : 'border-line bg-sunken hover:bg-hover',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink">{acc.name}</span>
                      <span className="rounded-[4px] border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-2">{acc.role}</span>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">{acc.email}</p>
                    <p className="mt-1.5 text-[11px] font-medium text-ink-2">{acc.org_name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">{acc.visibility_note}</p>
                    <span className={cn('mt-2 inline-flex items-center gap-1 border-t border-line/70 pt-2 text-[11px] font-medium', current ? 'text-ok' : 'text-ink-2')}>
                      {current ? <><Check size={12} /> Current session</> : <><UserCheck size={12} /> {selected ? 'Selected' : 'Select'}</>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <form onSubmit={submit} autoComplete="off" className="mt-6 space-y-3 rounded-[7px] border border-line bg-sunken p-4">
          <p className="eyebrow flex items-center gap-1.5">
            <KeyRound size={12} /> Account &amp; password
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-2">Email or account ID</span>
              <input
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value)
                  setPassword('')
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="name@chamber.in or account ID"
                className="w-full rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-navy"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-2">Password</span>
              <input
                ref={pwRef}
                key={identifier /* remount per account so browser autofill cannot carry a value across */}
                type="password"
                name={`pw-${identifier || 'none'}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                className="w-full rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-navy"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
              <Lock size={11} /> Every account has its own password.{' '}
              <Link to="/signup" onClick={() => closeAuth()} className="font-medium text-navy underline-offset-2 hover:underline">
                New chamber? Create an account
              </Link>
            </span>
            <button
              type="submit"
              disabled={busy || !identifier.trim() || !password}
              className="rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600 disabled:opacity-50"
            >
              {busy ? 'Signing in…' : authed ? 'Switch account' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

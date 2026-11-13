import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, KeyRound, Scale, ShieldCheck } from 'lucide-react'
import { ApiError, api } from '@/lib/api'
import { openAuth } from '@/lib/store'
import { sfx } from '@/lib/sound'

/** Self-serve sign-up: creates a new chamber with the user as its senior advocate. */
export default function Signup() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [chamber, setChamber] = useState('')
  const [city, setCity] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const strong = password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password)
  const valid = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && chamber.trim().length >= 2 && strong && password === confirm

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setErr(null)
    try {
      await api.signup({ name: name.trim(), email: email.trim(), password, chamber_name: chamber.trim(), city: city.trim() || undefined })
      sfx.accept()
      nav('/docket')
    } catch (ex) {
      setErr(
        ex instanceof ApiError && ex.status === 409
          ? 'An account with this email already exists. Sign in instead.'
          : ex instanceof Error
            ? ex.message
            : String(ex),
      )
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-[6px] border border-line-strong bg-sunken px-3 py-2 text-[13px] text-ink outline-none focus:border-navy'

  return (
    <div className="min-h-dvh bg-night px-4 py-10 text-bone">
      <div className="mx-auto max-w-lg">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[12px] text-fog hover:text-gold">
          <ArrowLeft size={14} /> Back to Insaaf
        </Link>
        <div className="mt-6 flex items-center gap-2">
          <Scale className="text-gold" size={22} />
          <h1 className="gold-text font-display text-[30px] leading-tight">Open your chamber</h1>
        </div>
        <p className="mt-2 text-[13px] text-fog">
          You become the senior advocate of a new, isolated chamber. Add juniors, clerks and law students from your profile once you are in.
        </p>

        <form onSubmit={submit} autoComplete="off" className="mt-6 space-y-4 rounded-[10px] border border-line bg-surface p-5 text-ink">
          {err && (
            <div role="alert" className="rounded-[6px] border border-bad-200 bg-bad-50 px-3 py-2 text-[12px] text-bad">
              {err}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-2">Your name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Adv. A. Fernandes" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-2">Work email</span>
              <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourchamber.in" autoComplete="off" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_0.7fr]">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-ink-2">
                <Building2 size={11} /> Chamber / firm / clinic name
              </span>
              <input className={field} value={chamber} onChange={(e) => setChamber(e.target.value)} placeholder="Fernandes Law Chambers" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-2">City (optional)</span>
              <input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Margao" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-ink-2">
                <KeyRound size={11} /> Password
              </span>
              <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <span className={`mt-1 block text-[11px] ${password && !strong ? 'text-warn' : 'text-ink-3'}`}>10+ characters with letters and numbers</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-2">Confirm password</span>
              <input className={field} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              {confirm && confirm !== password && <span className="mt-1 block text-[11px] text-bad">Passwords do not match</span>}
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
              <ShieldCheck size={12} /> Passwords are stored as salted PBKDF2 hashes.
            </span>
            <button
              type="submit"
              disabled={!valid || busy}
              className="rounded-[6px] bg-navy px-4 py-2 text-[13px] font-medium text-white hover:bg-navy-600 disabled:opacity-50"
            >
              {busy ? 'Creating chamber…' : 'Create chamber & sign in'}
            </button>
          </div>
        </form>
        <p className="mt-4 text-center text-[12px] text-fog">
          Already have an account?{' '}
          <button type="button" onClick={() => openAuth()} className="font-medium text-gold hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}

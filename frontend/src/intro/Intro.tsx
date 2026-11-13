import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import outline from './lady-outline.json'
import Rays from './Rays'

/**
 * Cinematic opener.
 *
 *  0.0s  velvet + light rays fade in and drift
 *  0.3s  Justice's outline is traced in glowing white (SVG stroke, starts at the sword tip)
 *  2.2s  the statue fades in while a soft beam of light slides down her from the top-left
 *  4.2s  outline dissolves, wordmark rises over a scrim
 *  5.6s  push-in: the stage scales into the scales of justice and cuts to the app
 *
 * Tap anywhere or click Skip to jump straight into Insaaf.
 */
export default function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'trace' | 'reveal' | 'title' | 'zoom'>('trace')
  const done = useRef(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 2200)
    const t2 = setTimeout(() => setPhase('title'), 4200)
    const t3 = setTimeout(() => setPhase('zoom'), 5600)
    const t4 = setTimeout(finish, 6700)
    return () => [t1, t2, t3, t4].forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { w, h, d } = outline as { w: number; h: number; d: string }
  const origin = useMemo(() => `${(240 / w) * 100}% ${(430 / h) * 100}%`, [w, h])

  return (
    <motion.div
      className="night fixed inset-0 z-50 overflow-hidden bg-night select-none"
      onPointerDown={finish}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      aria-label="Insaaf intro. Tap to skip."
      role="button"
    >
      <motion.div
        className="absolute inset-0"
        animate={phase === 'zoom' ? { scale: 3.2, filter: 'brightness(0.15) blur(6px)' } : { scale: 1, filter: 'brightness(1) blur(0px)' }}
        transition={{ duration: 1.15, ease: [0.7, 0, 0.84, 0] }}
        style={{ transformOrigin: '50% 38%', willChange: 'transform, filter' }}
      >
        <img src="/intro/velvet.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" draggable={false} />
        <Rays />

        <div className="absolute inset-x-0 bottom-0 top-[8dvh] flex items-end justify-center">
          <div className="relative h-[86dvh] max-h-[1100px]" style={{ aspectRatio: `${w} / ${h}`, transformOrigin: origin }}>
            <motion.img
              src="/intro/lady.webp"
              alt="Statue of Justice"
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              initial={{ opacity: 0, y: 16 }}
              animate={phase === 'trace' ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
              transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            />

            <motion.div
              className="absolute inset-0 mix-blend-screen pointer-events-none"
              style={{
                WebkitMaskImage: 'url(/intro/lady.webp)', maskImage: 'url(/intro/lady.webp)',
                WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center', maskPosition: 'center',
                background: 'linear-gradient(118deg, transparent 0%, transparent 28%, rgba(255,255,255,0.55) 42%, rgba(255,255,255,0.08) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '260% 260%',
              }}
              initial={{ opacity: 0, backgroundPosition: '100% 100%' }}
              animate={phase === 'trace' ? { opacity: 0, backgroundPosition: '100% 100%' } : { opacity: [0, 0.9, 0.35], backgroundPosition: ['100% 100%', '0% 0%', '0% 0%'] }}
              transition={{ duration: 2.6, ease: [0.16, 1, 0.3, 1], times: [0, 0.55, 1] }}
            />

            <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="b1" />
                  <feGaussianBlur stdDeviation="1.5" result="b2" />
                  <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <motion.path
                d={d} fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={phase === 'trace' ? { pathLength: 1, opacity: 1 } : phase === 'reveal' ? { pathLength: 1, opacity: 0.6 } : { pathLength: 1, opacity: 0 }}
                transition={{ pathLength: { duration: 2.1, ease: [0.65, 0, 0.35, 1] }, opacity: { duration: 0.9 } }}
              />
            </svg>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_100%,rgba(10,10,12,0.85)_0%,rgba(10,10,12,0)_55%)]" />
      </motion.div>

      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42dvh] bg-[linear-gradient(180deg,rgba(10,10,12,0)_0%,rgba(10,10,12,0.82)_55%,rgba(10,10,12,0.96)_100%)]"
        initial={{ opacity: 0 }} animate={{ opacity: phase === 'title' ? 1 : 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />

      <AnimatePresence>
        {(phase === 'title' || phase === 'zoom') && (
          <motion.div
            key="title"
            className="absolute inset-x-0 bottom-[9dvh] flex flex-col items-center gap-3 px-6 text-center"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: phase === 'zoom' ? 0 : 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <Wordmark />
            <p className="text-fog text-[13px] font-light tracking-wide">Writes the first draft. Refuses to write a claim it can&rsquo;t prove.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          finish()
        }}
        className="absolute bottom-5 right-5 z-10 inline-flex items-center gap-2 rounded-full border border-bone/25 bg-night/80 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-bone/90 backdrop-blur-sm transition hover:border-bone/50 hover:bg-night-3"
      >
        Skip intro →
      </button>
    </motion.div>
  )
}

function Wordmark() {
  return (
    <div className="flex items-baseline gap-[0.08em]">
      {'INSAAF'.split('').map((ch, i) => (
        <motion.span
          key={i}
          className="text-[56px] leading-none font-normal tracking-[-0.04em] ray-text"
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.05 * i, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {ch}
        </motion.span>
      ))}
    </div>
  )
}

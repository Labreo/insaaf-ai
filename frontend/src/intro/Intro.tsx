import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import outline from './lady-outline.json'

/**
 * Cinematic opener.
 *
 *  0.0s  velvet + light rays fade in and drift
 *  0.6s  Justice's outline is traced in glowing white (SVG stroke, starts at the sword tip)
 *  2.4s  the statue fades in while a soft beam of light slides down her from the top-left
 *  4.2s  outline dissolves, wordmark rises
 *  5.4s  Netflix-style push-in: the whole stage scales into the scales of justice and cuts to black
 *
 * Tap anywhere to skip. Honours prefers-reduced-motion.
 */
export default function Intro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<'trace' | 'reveal' | 'title' | 'zoom'>('trace')
  const done = useRef(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(() => {
    if (reduce) { const t = setTimeout(finish, 900); return () => clearTimeout(t) }
    const t1 = setTimeout(() => setPhase('reveal'), 2200)
    const t2 = setTimeout(() => setPhase('title'), 4200)
    const t3 = setTimeout(() => setPhase('zoom'), 5600)
    const t4 = setTimeout(finish, 6700)
    return () => [t1, t2, t3, t4].forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])

  const { w, h, d } = outline as { w: number; h: number; d: string }
  // aim the push-in at the scales (upper-left of the figure)
  const origin = useMemo(() => `${(240 / w) * 100}% ${(430 / h) * 100}%`, [w, h])

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-void select-none"
      onPointerDown={finish}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      aria-label="Insaaf intro. Tap to skip."
      role="button"
    >
      {/* Stage: everything inside scales during the push-in */}
      <motion.div
        className="absolute inset-0"
        animate={phase === 'zoom' ? { scale: 3.2, filter: 'brightness(0.15) blur(6px)' } : { scale: 1, filter: 'brightness(1) blur(0px)' }}
        transition={{ duration: 1.15, ease: [0.7, 0, 0.84, 0] }}
        style={{ transformOrigin: '50% 38%' }}
      >
        {/* velvet */}
        <img src="/intro/velvet.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" draggable={false} />

        {/* light rays — three soft diagonal beams, drifting */}
        <Rays />

        {/* figure */}
        <div className="absolute inset-x-0 bottom-0 top-[8dvh] flex items-end justify-center">
          <div className="relative h-[86dvh] max-h-[1100px]" style={{ aspectRatio: `${w} / ${h}`, transformOrigin: origin }}>
            {/* statue */}
            <motion.img
              src="/intro/lady.webp"
              alt="Statue of Justice"
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              initial={{ opacity: 0, y: 16 }}
              animate={phase === 'trace' ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
              transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* beam of light falling across her, clipped to her silhouette */}
            <motion.div
              className="absolute inset-0 mix-blend-screen pointer-events-none"
              style={{
                WebkitMaskImage: 'url(/intro/lady.webp)', maskImage: 'url(/intro/lady.webp)',
                WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center', maskPosition: 'center',
                background:
                  'linear-gradient(118deg, transparent 0%, transparent 28%, rgba(255,255,255,0.55) 42%, rgba(255,255,255,0.08) 50%, transparent 60%, transparent 100%)',
                backgroundSize: '260% 260%',
              }}
              initial={{ opacity: 0, backgroundPosition: '100% 100%' }}
              animate={
                phase === 'trace'
                  ? { opacity: 0, backgroundPosition: '100% 100%' }
                  : { opacity: [0, 0.9, 0.35], backgroundPosition: ['100% 100%', '0% 0%', '0% 0%'] }
              }
              transition={{ duration: 2.6, ease: [0.16, 1, 0.3, 1], times: [0, 0.55, 1] }}
            />

            {/* traced outline */}
            <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="b1" />
                  <feGaussianBlur stdDeviation="1.5" result="b2" />
                  <feMerge><feMergeNode in="b1" /><feMergeNode in="b2" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <motion.path
                d={d}
                fill="none"
                stroke="#ffffff"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  phase === 'trace'
                    ? { pathLength: 1, opacity: 1 }
                    : phase === 'reveal'
                    ? { pathLength: 1, opacity: 0.6 }
                    : { pathLength: 1, opacity: 0 }
                }
                transition={{ pathLength: { duration: 2.1, ease: [0.65, 0, 0.35, 1] }, opacity: { duration: 0.9 } }}
              />
            </svg>
          </div>
        </div>

        {/* floor vignette so she stands in darkness */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_100%,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0)_55%)]" />
      </motion.div>

      {/* scrim so the wordmark reads over the statue */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42dvh] bg-[linear-gradient(180deg,rgba(5,5,6,0)_0%,rgba(5,5,6,0.82)_55%,rgba(5,5,6,0.96)_100%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'title' ? 1 : 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* wordmark */}
      <AnimatePresence>
        {(phase === 'title' || phase === 'zoom') && (
          <motion.div
            key="title"
            className="absolute inset-x-0 bottom-[9dvh] flex flex-col items-center gap-3 px-6 text-center"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: phase === 'zoom' ? 0 : 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <Wordmark />
            <p className="text-pewter text-[13px] font-light tracking-wide">
              Writes the first draft. Refuses to write a claim it can&rsquo;t prove.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="absolute bottom-4 right-5 text-[11px] uppercase tracking-[0.18em] text-smoke/70">tap to skip</p>
    </motion.div>
  )
}

function Wordmark() {
  const letters = 'INSAAF'.split('')
  return (
    <div className="flex items-baseline gap-[0.08em]">
      {letters.map((ch, i) => (
        <motion.span
          key={i}
          className="text-[56px] leading-none font-normal tracking-[-0.04em] ray-text"
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.05 * i, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {ch}
        </motion.span>
      ))}
    </div>
  )
}

function Rays() {
  const beams = [
    { left: '-18%', w: '38%', rot: 28, delay: 0, dur: 11, peak: 0.42 },
    { left: '6%', w: '26%', rot: 30, delay: 1.2, dur: 13, peak: 0.28 },
    { left: '24%', w: '18%', rot: 32, delay: 2.1, dur: 9.5, peak: 0.18 },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {beams.map((b, i) => (
        <motion.div
          key={i}
          className="absolute -top-[40%] h-[200%]"
          style={{
            left: b.left, width: b.w, rotate: b.rot, transformOrigin: 'top left',
            background: 'linear-gradient(90deg, transparent 0%, rgba(233,231,225,0.9) 50%, transparent 100%)',
            filter: 'blur(28px)', mixBlendMode: 'screen',
          }}
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: [0, b.peak, b.peak * 0.7, b.peak], x: [-40, 0, 24, 0] }}
          transition={{ delay: b.delay * 0.3, duration: b.dur, times: [0, 0.18, 0.6, 1], ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }}
        />
      ))}
      {/* dust motes */}
      {Array.from({ length: 14 }).map((_, i) => (
        <motion.span
          key={`m${i}`}
          className="absolute h-[2px] w-[2px] rounded-full bg-ray/70"
          style={{ left: `${8 + ((i * 37) % 70)}%`, top: `${5 + ((i * 53) % 80)}%` }}
          animate={{ opacity: [0, 0.8, 0], y: [0, 26 + (i % 5) * 6] }}
          transition={{ delay: (i % 7) * 0.6, duration: 6 + (i % 4), repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

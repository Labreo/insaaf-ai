import { motion } from 'motion/react'

/** Soft diagonal light beams + drifting dust. Used by the intro at full strength and the app backdrop at low strength. */
export default function Rays({ strength = 1, motes = 14 }: { strength?: number; motes?: number }) {
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
            filter: 'blur(28px)', mixBlendMode: 'screen', willChange: 'transform, opacity',
          }}
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: [0, b.peak * strength, b.peak * 0.7 * strength, b.peak * strength], x: [-40, 0, 24, 0] }}
          transition={{ delay: b.delay * 0.3, duration: b.dur, times: [0, 0.18, 0.6, 1], ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }}
        />
      ))}
      {Array.from({ length: motes }).map((_, i) => (
        <motion.span
          key={`m${i}`}
          className="absolute h-[2px] w-[2px] rounded-full bg-ray/70"
          style={{ left: `${8 + ((i * 37) % 70)}%`, top: `${5 + ((i * 53) % 80)}%` }}
          animate={{ opacity: [0, 0.8 * strength, 0], y: [0, 26 + (i % 5) * 6] }}
          transition={{ delay: (i % 7) * 0.6, duration: 6 + (i % 4), repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

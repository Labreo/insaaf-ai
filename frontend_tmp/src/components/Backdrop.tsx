import { useReducedMotion } from 'motion/react'
import Rays from '@/intro/Rays'
import { Particles } from '@/components/magicui/particles'

/**
 * The app lives in the same room as the intro: velvet, a faint ray, drifting dust, film grain.
 * Fixed layers; the statue is ghosted behind the home screen by the screen itself.
 */
export default function Backdrop() {
  const reduce = useReducedMotion()
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void">
        <img src="/intro/velvet.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" draggable={false} />
        {!reduce && <Rays strength={0.45} motes={8} />}
        {!reduce && <Particles className="absolute inset-0" quantity={40} staticity={60} ease={70} size={0.5} color="#e9e7e1" />}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_110%,rgba(10,10,12,0.9)_0%,rgba(10,10,12,0.2)_60%,rgba(10,10,12,0)_100%)]" />
      </div>
      <div className="grain" aria-hidden><div /></div>
    </>
  )
}

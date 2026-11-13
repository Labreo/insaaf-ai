import { useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { api } from './lib/api'
import { useDB } from './lib/store'
import Signup from './screens/Signup'
import Intro from './intro/Intro'
import AuthModal from './components/AuthModal'
import Feedback from './components/Feedback'
import Shell from './components/Shell'
import Landing from './screens/Landing'
import Home from './screens/Home'
import Matter from './screens/Matter'
import LedgerScreen from './screens/LedgerScreen'
import NewMatter from './screens/NewMatter'
import Alerts from './screens/Alerts'
import Me from './screens/Me'

export default function App() {
  // Plays once per browser session on first load, then after every sign-in / sign-up / account switch.
  const [intro, setIntro] = useState(() => {
    try {
      if (sessionStorage.getItem('insaaf_intro_seen')) return false
      sessionStorage.setItem('insaaf_intro_seen', '1')
    } catch {
      /* storage blocked: just play it */
    }
    return true
  })
  const introNonce = useDB((s) => s.introNonce)
  const lastNonce = useRef(introNonce)
  useEffect(() => {
    if (introNonce !== lastNonce.current) {
      lastNonce.current = introNonce
      setIntro(true)
    }
  }, [introNonce])

  useEffect(() => {
    api.bootstrap()
  }, [])

  return (
    <>
      <AnimatePresence>
        {intro && <Intro key="intro" onDone={() => setIntro(false)} />}
      </AnimatePresence>

      <AuthModal />
      <Feedback />
      <Routes>
        <Route path="/" element={<Landing onReplayIntro={() => setIntro(true)} />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<Shell onReplayIntro={() => setIntro(true)} />}>
          <Route path="docket" element={<Home />} />
          <Route path="matters/:id" element={<Matter />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="ledger" element={<LedgerScreen />} />
          <Route path="new" element={<NewMatter />} />
          <Route path="me" element={<Me onReplayIntro={() => setIntro(true)} />} />
        </Route>
      </Routes>
    </>
  )
}

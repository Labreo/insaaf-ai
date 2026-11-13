import { useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { api } from './lib/api'
import { getDB, useDB } from './lib/store'
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
import PrecedentSearch from './screens/PrecedentSearch'
import Alerts from './screens/Alerts'
import Me from './screens/Me'

export default function App() {
  // Triggers automatically on login, sign-up, account switch (introNonce / insaaf:auth-transition)
  // or explicit replay, while never replaying during ordinary route navigation.
  const [introRunId, setIntroRunId] = useState(0)
  const [introVisible, setIntroVisible] = useState(false)

  const introNonce = useDB((s) => s.introNonce)
  const lastNonce = useRef(introNonce)

  const triggerIntro = useCallback(() => {
    setIntroRunId((n) => n + 1)
    setIntroVisible(true)
  }, [])

  useEffect(() => {
    if (introNonce > lastNonce.current) {
      lastNonce.current = introNonce
      triggerIntro()
    }
  }, [introNonce, triggerIntro])

  useEffect(() => {
    const onAuthTransition = () => {
      // Ensure listeners of custom auth events stay synchronized if triggered outside hook cycle.
      if (getDB().introNonce > lastNonce.current) {
        lastNonce.current = getDB().introNonce
        triggerIntro()
      }
    }
    window.addEventListener('insaaf:auth-transition', onAuthTransition)
    return () => window.removeEventListener('insaaf:auth-transition', onAuthTransition)
  }, [triggerIntro])

  useEffect(() => {
    api.bootstrap()
  }, [])

  return (
    <>
      <AnimatePresence>
        {introVisible && <Intro key={`intro-${introRunId}`} onDone={() => setIntroVisible(false)} />}
      </AnimatePresence>

      <AuthModal />
      <Feedback />
      <Routes>
        <Route path="/" element={<Landing onReplayIntro={triggerIntro} />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<Shell onReplayIntro={triggerIntro} />}>
          <Route path="docket" element={<Home />} />
          <Route path="precedents" element={<PrecedentSearch />} />
          <Route path="matters/:id" element={<Matter />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="ledger" element={<LedgerScreen />} />
          <Route path="new" element={<NewMatter />} />
          <Route path="me" element={<Me onReplayIntro={triggerIntro} />} />
        </Route>
      </Routes>
    </>
  )
}

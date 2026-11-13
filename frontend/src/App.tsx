import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { api } from './lib/api'
import Intro from './intro/Intro'
import Shell from './components/Shell'
import Landing from './screens/Landing'
import Home from './screens/Home'
import Matter from './screens/Matter'
import LedgerScreen from './screens/LedgerScreen'
import NewMatter from './screens/NewMatter'
import Alerts from './screens/Alerts'
import Me from './screens/Me'

export default function App() {
  const [intro, setIntro] = useState(false)

  useEffect(() => {
    api.bootstrap()
  }, [])

  return (
    <>
      <AnimatePresence>
        {intro && <Intro key="intro" onDone={() => setIntro(false)} />}
      </AnimatePresence>

      <Routes>
        <Route path="/" element={<Landing onReplayIntro={() => setIntro(true)} />} />
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

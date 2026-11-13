import { useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import Intro from './intro/Intro'
import Shell from './components/Shell'
import Home from './screens/Home'
import Matter from './screens/Matter'
import LedgerScreen from './screens/LedgerScreen'
import NewMatter from './screens/NewMatter'
import Alerts from './screens/Alerts'
import Me from './screens/Me'

const KEY = 'insaaf.intro.seen'

export default function App() {
  const [intro, setIntro] = useState(() => {
    try { return sessionStorage.getItem(KEY) !== '1' } catch { return true }
  })
  const nav = useNavigate()

  const finish = () => {
    try { sessionStorage.setItem(KEY, '1') } catch { /* private mode */ }
    setIntro(false)
    nav('/', { replace: true })
  }

  return (
    <>
      <AnimatePresence>{intro && <Intro key="intro" onDone={finish} />}</AnimatePresence>
      <motion.div initial={{ opacity: 0, scale: 1.04 }} animate={intro ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="matters/:id" element={<Matter />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="ledger" element={<LedgerScreen />} />
            <Route path="new" element={<NewMatter />} />
            <Route path="me" element={<Me onReplayIntro={() => setIntro(true)} />} />
          </Route>
        </Routes>
      </motion.div>
    </>
  )
}

import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Privacy from './pages/Privacy'
import Support from './pages/Support'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/support" element={<Support />} />
    </Routes>
  )
}

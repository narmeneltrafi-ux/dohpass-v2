import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import SpecialistQuiz from './pages/SpecialistQuiz.jsx'
import GPQuiz from './pages/GPQuiz.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/specialist" element={<SpecialistQuiz />} />
        <Route path="/gp" element={<GPQuiz />} />
      </Routes>
    </BrowserRouter>
  )
}

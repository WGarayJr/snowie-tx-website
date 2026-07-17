import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import CheckIn from './pages/CheckIn'
import Host from './pages/Host'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/e/:code" element={<CheckIn />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  )
}

import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import AuctionDetail from './pages/AuctionDetail'
import Dashboard from './pages/Dashboard'
import Deposit from './pages/Deposit'
import Shipping from './pages/Shipping'
import AdminPanel from './pages/AdminPanel'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import { useAuthStore } from './store/useAuthStore'

function App() {
  const { fetchMe } = useAuthStore()
  useEffect(() => { fetchMe() }, [])

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <Navbar />

      <main className="flex-1">
        <Routes>
          <Route path="/"                       element={<Home />} />
          <Route path="/login"                  element={<Login />} />
          <Route path="/register"               element={<Register />} />
          <Route path="/auction/:id"            element={<AuctionDetail />} />
          <Route path="/dashboard"              element={<Dashboard />} />
          <Route path="/deposit"                element={<Deposit />} />
          <Route path="/auction/:id/shipping"   element={<Shipping />} />
          <Route path="/admin"                  element={<AdminPanel />} />
          <Route path="/terminos"               element={<Terms />} />
          <Route path="/aviso-privacidad"       element={<Privacy />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-stone-400">© 2026 SubastasGeek. Todos los derechos reservados.</span>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <a href="/aviso-privacidad" className="text-xs text-stone-400 hover:text-stone-600 transition-colors">Aviso de privacidad</a>
            <a href="/terminos" className="text-xs text-stone-400 hover:text-stone-600 transition-colors">Términos</a>
            <a href="mailto:contacto@subastasgeek.com" className="text-xs text-stone-400 hover:text-stone-600 transition-colors">Quejas y aclaraciones</a>
            <span className="text-xs text-stone-300 hidden sm:inline">|</span>
            <a
              href="https://www.gob.mx/condusef"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              CONDUSEF
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App

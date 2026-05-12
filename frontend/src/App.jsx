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

function App() {
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
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-stone-400">© 2026 Subastas. Todos los derechos reservados.</span>
          <div className="flex items-center gap-4">
            <a href="/aviso-privacidad" className="text-xs text-stone-400 hover:text-stone-600 transition-colors">Aviso de privacidad</a>
            <a href="#" className="text-xs text-stone-400 hover:text-stone-600 transition-colors">Términos</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App


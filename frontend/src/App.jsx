import { Link, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import AuctionDetail from './pages/AuctionDetail'
import Dashboard from './pages/Dashboard'
import Deposit from './pages/Deposit'
import AdminPanel from './pages/AdminPanel'

function App() {
  const { user, logout } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-indigo-600">Subastas</Link>
        <div className="space-x-4 flex items-center">
          {user ? (
            <>
              <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Mi Cuenta</Link>
              <button onClick={logout} className="text-sm text-gray-600 hover:text-gray-900">Cerrar sesión</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">Entrar</Link>
              <Link to="/register" className="text-sm text-gray-600 hover:text-gray-900">Registro</Link>
            </>
          )}
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auction/:id" element={<AuctionDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/deposit" element={<Deposit />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

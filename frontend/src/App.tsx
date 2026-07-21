import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { ResumeEditor } from './pages/ResumeEditor'
import { ResumeList } from './pages/ResumeList'

function RequireAuth({ children }: { children: ReactNode }) {
  const t = localStorage.getItem('token')
  if (!t) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<ResumeList />} />
        <Route path="resumes/:id" element={<ResumeEditor />} />
      </Route>
    </Routes>
  )
}

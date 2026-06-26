import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import AdminLayout from './pages/AdminLayout'
import AdminHomePage from './pages/AdminHomePage'
import AdminKanbanPage from './pages/AdminKanbanPage'
import AdminGenerationsPage from './pages/AdminGenerationsPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AdminGenerationPage from './pages/AdminGenerationPage'
import AdminMetricsPage from './pages/AdminMetricsPage'
import TraceLabPage from './pages/TraceLabPage'
import LabLayout from './pages/LabLayout'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter basename="/admin">
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<AdminHomePage />} />
              <Route path="commandes" element={<AdminKanbanPage />} />
              <Route path="generations" element={<AdminGenerationsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="metrics" element={<AdminMetricsPage />} />
              <Route path="g/:id" element={<AdminGenerationPage />} />
              <Route path="lab" element={<LabLayout />}>
                <Route index element={<Navigate to="trace" replace />} />
                <Route path="trace" element={<TraceLabPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  </React.StrictMode>,
)

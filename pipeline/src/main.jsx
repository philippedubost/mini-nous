import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import PipelinePage from './pages/PipelinePage'
import StudioPage from './pages/StudioPage'
import OrderStatusPage from './pages/OrderStatusPage'
import AccountPage from './pages/AccountPage'
import AccountLoginPage from './pages/AccountLoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import AdminLayout from './pages/AdminLayout'
import AdminKanbanPage from './pages/AdminKanbanPage'
import AdminGenerationsPage from './pages/AdminGenerationsPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AdminGenerationPage from './pages/AdminGenerationPage'
import TraceLabPage from './pages/TraceLabPage'
import LabLayout from './pages/LabLayout'
import NewOrderPage from './pages/NewOrderPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import PaymentCancelPage from './pages/PaymentCancelPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SettingsProvider>
      <BrowserRouter basename="/pipeline">
        <Routes>
          <Route path="/" element={<Navigate to="/compte" replace />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/legacy" element={<PipelinePage />} />
          <Route path="/commande" element={<OrderStatusPage />} />
          <Route path="/compte" element={<AccountPage />} />
          <Route path="/compte/connexion" element={<AccountLoginPage />} />
          <Route path="/compte/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/lab" element={<LabLayout />}>
            <Route index element={<Navigate to="trace" replace />} />
            <Route path="trace" element={<TraceLabPage />} />
          </Route>
          <Route path="/nouvelle-commande" element={<NewOrderPage />} />
          <Route path="/paiement/reussi" element={<PaymentSuccessPage />} />
          <Route path="/paiement/annule" element={<PaymentCancelPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminKanbanPage />} />
            <Route path="generations" element={<AdminGenerationsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="g/:id" element={<AdminGenerationPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/compte" replace />} />
        </Routes>
      </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  </React.StrictMode>,
)

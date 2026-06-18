import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import PipelinePage from './pages/PipelinePage'
import AdminLayout from './pages/AdminLayout'
import AdminGenerationsPage from './pages/AdminGenerationsPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AdminGenerationPage from './pages/AdminGenerationPage'
import TraceLabPage from './pages/TraceLabPage'
import LabLayout from './pages/LabLayout'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import PaymentCancelPage from './pages/PaymentCancelPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/pipeline">
      <Routes>
        <Route path="/" element={<PipelinePage />} />
        <Route path="/lab" element={<LabLayout />}>
          <Route index element={<Navigate to="trace" replace />} />
          <Route path="trace" element={<TraceLabPage />} />
        </Route>
        <Route path="/paiement/reussi" element={<PaymentSuccessPage />} />
        <Route path="/paiement/annule" element={<PaymentCancelPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminGenerationsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="g/:id" element={<AdminGenerationPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ServerWorkerPage from './pages/ServerWorkerPage'
import ServerOrderPage from './pages/ServerOrderPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/server">
      <Routes>
        <Route path="/" element={<ServerWorkerPage />} />
        <Route path="/c/:orderId" element={<ServerOrderPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)

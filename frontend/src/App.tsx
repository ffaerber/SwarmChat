import { useState } from 'react'
import { WagmiProvider, useAccount } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Routes, Route } from 'react-router'
import { Toaster } from 'react-hot-toast'
import { config } from './config/wagmi'
import { BeeProvider } from './hooks/BeeContext'
import ChainGuard from './components/ChainGuard'
import Nav from './components/Nav'
import Sidebar from './components/Sidebar'
import ChatList from './components/ChatList'
import Conversation from './components/Conversation'
import Directory from './components/Directory'
import Modal from './components/Modal'

const queryClient = new QueryClient()

function AppContent() {
  const { isConnected } = useAccount()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <BeeProvider>
      <HashRouter>
        {isConnected && <ChainGuard />}
        <div className="flex flex-col h-screen">
          <Nav onConnectClick={() => setModalOpen(true)} />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col bg-[#0f1419]">
              <Routes>
                <Route path="/" element={<ChatList />} />
                <Route path="/directory" element={<Directory />} />
                <Route path="/chat/:peer" element={<Conversation />} />
              </Routes>
            </main>
          </div>
        </div>
        {modalOpen && <Modal handleClose={() => setModalOpen(false)} />}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#161c22', color: '#e8eef2', border: '1px solid #252d34' },
          }}
        />
      </HashRouter>
    </BeeProvider>
  )
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

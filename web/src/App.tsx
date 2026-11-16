import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { getToken } from './api/client'
import { KioskLogin, OwnerLogin } from './auth/Login'
import { i18n } from './i18n'
import { KioskApp } from './kiosk/KioskApp'
import { OwnerApp } from './owner/OwnerApp'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })

function RequireToken({ to, children }: { to: string; children: React.ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to={to} replace />
}

function KioskRoute() {
  const [params] = useSearchParams()
  return <KioskApp farmId={params.get('farm') ?? undefined} />
}

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<OwnerLogin />} />
            <Route path="/kiosk/login" element={<KioskLogin />} />
            <Route path="/kiosk" element={<RequireToken to="/kiosk/login"><KioskRoute /></RequireToken>} />
            <Route path="/owner/*" element={<RequireToken to="/login"><OwnerApp /></RequireToken>} />
            <Route path="*" element={<Navigate to="/owner" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  )
}

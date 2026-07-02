import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'

// Pages are code-split per route so the initial bundle stays small. Layout (the
// app shell) is eager so it persists across navigations; each page lazy-loads
// into the Outlet behind a Suspense fallback.
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const PortfolioPage = lazy(() => import('@/pages/PortfolioPage').then((m) => ({ default: m.PortfolioPage })))
const PortfolioDetailPage = lazy(() => import('@/pages/PortfolioDetailPage').then((m) => ({ default: m.PortfolioDetailPage })))
const PortfolioReviewWorkspace = lazy(() => import('@/pages/PortfolioReviewWorkspace').then((m) => ({ default: m.PortfolioReviewWorkspace })))
const SecurityAdditionWorkspace = lazy(() => import('@/pages/SecurityAdditionWorkspace').then((m) => ({ default: m.SecurityAdditionWorkspace })))
const SecurityDetailPage = lazy(() => import('@/pages/SecurityDetailPage').then((m) => ({ default: m.SecurityDetailPage })))
const SecuritiesPage = lazy(() => import('@/pages/SecuritiesPage').then((m) => ({ default: m.SecuritiesPage })))
const ResearchPage = lazy(() => import('@/pages/ResearchPage').then((m) => ({ default: m.ResearchPage })))
const WatchlistPage = lazy(() => import('@/pages/WatchlistPage').then((m) => ({ default: m.WatchlistPage })))
const AtRiskPage = lazy(() => import('@/pages/AtRiskPage').then((m) => ({ default: m.AtRiskPage })))
const IndexMoversPage = lazy(() => import('@/pages/IndexMoversPage').then((m) => ({ default: m.IndexMoversPage })))
const ReviewCalendarPage = lazy(() => import('@/pages/ReviewCalendarPage').then((m) => ({ default: m.ReviewCalendarPage })))
const ActionItemsPage = lazy(() => import('@/pages/ActionItemsPage').then((m) => ({ default: m.ActionItemsPage })))
const ClientsPage = lazy(() => import('@/pages/ClientsPage').then((m) => ({ default: m.ClientsPage })))
const ClientDetailPage = lazy(() => import('@/pages/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })))
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const DocumentsPage = lazy(() => import('@/pages/settings/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const ImportExportPage = lazy(() => import('@/pages/settings/ImportExportPage').then((m) => ({ default: m.ImportExportPage })))
const BenchmarksPage = lazy(() => import('@/pages/settings/BenchmarksPage').then((m) => ({ default: m.BenchmarksPage })))
const NotificationsPage = lazy(() => import('@/pages/settings/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const ModelPortfoliosPage = lazy(() => import('@/pages/settings/ModelPortfoliosPage').then((m) => ({ default: m.ModelPortfoliosPage })))
const EditModelPortfolioPage = lazy(() => import('@/pages/settings/EditModelPortfolioPage').then((m) => ({ default: m.EditModelPortfolioPage })))
const CompliancePage = lazy(() => import('@/pages/settings/CompliancePage').then((m) => ({ default: m.CompliancePage })))

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-400">Loading…</div>}>
      {children}
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Page><HomePage /></Page>} />
          <Route path="portfolio" element={<Page><PortfolioPage /></Page>} />
          <Route path="securities" element={<Page><SecuritiesPage /></Page>} />
          <Route path="watchlist" element={<Page><WatchlistPage /></Page>} />
          <Route path="at-risk" element={<Page><AtRiskPage /></Page>} />
          <Route path="index-movers" element={<Page><IndexMoversPage /></Page>} />
          <Route path="reviews" element={<Page><ReviewCalendarPage /></Page>} />
          <Route path="actions" element={<Page><ActionItemsPage /></Page>} />
          <Route path="clients" element={<Page><ClientsPage /></Page>} />
          <Route path="clients/:clientId" element={<Page><ClientDetailPage /></Page>} />
          <Route path="portfolio/:portfolioId" element={<Page><PortfolioDetailPage /></Page>} />
          <Route path="portfolio/:portfolioId/review/:cadence" element={<Page><PortfolioReviewWorkspace /></Page>} />
          <Route path="portfolio/:portfolioId/candidate/:additionId" element={<Page><SecurityAdditionWorkspace /></Page>} />
          <Route path="security/:securityId" element={<Page><SecurityDetailPage /></Page>} />
          <Route path="research" element={<Page><ResearchPage /></Page>} />
          <Route path="audit" element={<Page><AuditLogPage /></Page>} />
          <Route path="settings" element={<Page><SettingsPage /></Page>} />
          <Route path="settings/documents" element={<Page><DocumentsPage /></Page>} />
          <Route path="settings/import-export" element={<Page><ImportExportPage /></Page>} />
          <Route path="settings/benchmarks" element={<Page><BenchmarksPage /></Page>} />
          <Route path="settings/notifications" element={<Page><NotificationsPage /></Page>} />
          <Route path="settings/model-portfolios" element={<Page><ModelPortfoliosPage /></Page>} />
          <Route path="settings/model-portfolios/:id/edit" element={<Page><EditModelPortfolioPage /></Page>} />
          <Route path="settings/compliance" element={<Page><CompliancePage /></Page>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App

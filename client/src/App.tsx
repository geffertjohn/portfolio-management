import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { HomePage } from '@/pages/HomePage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { PortfolioDetailPage } from '@/pages/PortfolioDetailPage'
import { SecurityDetailPage } from '@/pages/SecurityDetailPage'
import { SecuritiesPage } from '@/pages/SecuritiesPage'
import { ResearchPage } from '@/pages/ResearchPage'
import { WatchlistPage } from '@/pages/WatchlistPage'
import { AtRiskPage } from '@/pages/AtRiskPage'
import { IndexMoversPage } from '@/pages/IndexMoversPage'
import { ReviewCalendarPage } from '@/pages/ReviewCalendarPage'
import { ActionItemsPage } from '@/pages/ActionItemsPage'
import { ClientsPage } from '@/pages/ClientsPage'
import { ClientDetailPage } from '@/pages/ClientDetailPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { DocumentsPage } from '@/pages/settings/DocumentsPage'
import { ImportExportPage } from '@/pages/settings/ImportExportPage'
import { BenchmarksPage } from '@/pages/settings/BenchmarksPage'
import { NotificationsPage } from '@/pages/settings/NotificationsPage'
import { ModelPortfoliosPage } from '@/pages/settings/ModelPortfoliosPage'
import { CompliancePage } from '@/pages/settings/CompliancePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="securities" element={<SecuritiesPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="at-risk" element={<AtRiskPage />} />
          <Route path="index-movers" element={<IndexMoversPage />} />
          <Route path="reviews" element={<ReviewCalendarPage />} />
          <Route path="actions" element={<ActionItemsPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="portfolio/:portfolioId" element={<PortfolioDetailPage />} />
          <Route path="security/:securityId" element={<SecurityDetailPage />} />
          <Route path="research" element={<ResearchPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/documents" element={<DocumentsPage />} />
          <Route path="settings/import-export" element={<ImportExportPage />} />
          <Route path="settings/benchmarks" element={<BenchmarksPage />} />
          <Route path="settings/notifications" element={<NotificationsPage />} />
          <Route path="settings/model-portfolios" element={<ModelPortfoliosPage />} />
          <Route path="settings/compliance" element={<CompliancePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App

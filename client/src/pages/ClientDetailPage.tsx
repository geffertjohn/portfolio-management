import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchClientById, fetchClientPortfolios,
  linkPortfolioToClient, unlinkPortfolioFromClient,
} from '@/lib/clients'
import { fetchPortfolios } from '@/lib/portfolio'
import type { Portfolio } from '@/types/portfolio'
import { fetchActionItems } from '@/lib/actionItems'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { CommunicationTimeline } from '@/components/CommunicationTimeline'
import { LogCommunicationModal } from '@/components/LogCommunicationModal'
import { CreateActionItemModal } from '@/components/CreateActionItemModal'
import { StatusBadge } from '@/components/StatusBadge'
import { IPSPanel } from '@/components/IPSPanel'
import { HouseholdView } from '@/components/HouseholdView'

type Tab = 'portfolios' | 'communications' | 'actions' | 'ips' | 'household'

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const id = clientId ? parseInt(clientId, 10) : NaN
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('portfolios')
  const [logCommOpen, setLogCommOpen] = useState(false)
  const [createActionOpen, setCreateActionOpen] = useState(false)
  const [linkPortfolioId, setLinkPortfolioId] = useState('')

  const { data: client, isLoading } = useQuery({
    queryKey: QUERY_KEYS.client(id),
    queryFn: () => fetchClientById(id),
    enabled: !isNaN(id),
  })

  const { data: clientPortfolios = [] } = useQuery({
    queryKey: QUERY_KEYS.clientPortfolios(id),
    queryFn: () => fetchClientPortfolios(id),
    enabled: !isNaN(id),
  })

  const { data: allPortfolios = [] } = useQuery<Portfolio[]>({
    queryKey: QUERY_KEYS.portfolios,
    queryFn: fetchPortfolios,
  })

  // Action items linked to any of this client's portfolios
  const linkedPortfolioNameList = clientPortfolios.map((cp) => cp.portfolio_name)
  const { data: actionItems = [] } = useQuery({
    queryKey: [...QUERY_KEYS.actionItems, 'all'],
    queryFn: () => fetchActionItems(),
    select: (items) =>
      items.filter(
        (item) =>
          item.portfolio_name != null && linkedPortfolioNameList.includes(item.portfolio_name)
      ),
    enabled: clientPortfolios.length > 0,
  })

  const linkMutation = useMutation({
    mutationFn: () => linkPortfolioToClient(id, linkPortfolioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientPortfolios(id) })
      setLinkPortfolioId('')
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: (portfolioName: string) => unlinkPortfolioFromClient(id, portfolioName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientPortfolios(id) }),
  })

  if (isLoading) return <p className="text-gray-500">Loading…</p>
  if (!client) return (
    <div>
      <Link to="/clients" className="text-sm text-gray-600 hover:text-gray-900">← Back to Clients</Link>
      <p className="mt-4 text-gray-500">Client not found.</p>
    </div>
  )

  const linkedPortfolioIds = new Set(clientPortfolios.map((cp) => cp.portfolio_name))
  const availablePortfolios = allPortfolios.filter((p) => !linkedPortfolioIds.has(p.name))

  const TABS: { id: Tab; label: string }[] = [
    { id: 'portfolios', label: 'Portfolios' },
    { id: 'communications', label: 'Communications' },
    { id: 'actions', label: 'Action Items' },
    { id: 'ips', label: 'IPS' },
    ...(client.household_name ? [{ id: 'household' as Tab, label: 'Household' }] : []),
  ]

  return (
    <div>
      <Link to="/clients" className="inline-block text-sm text-gray-600 hover:text-gray-900">← Back to Clients</Link>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">{client.name}</h1>
        {client.household_name && <p className="mt-1 text-gray-500">{client.household_name}</p>}

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {client.email && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Email</dt>
              <dd className="mt-1 text-gray-900">{client.email}</dd>
            </div>
          )}
          {client.model_portfolio_name && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Model Portfolio</dt>
              <dd className="mt-1 text-gray-900">{client.model_portfolio_name}</dd>
            </div>
          )}
        </dl>

        {client.notes && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="text-sm text-gray-600">{client.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {tab === 'portfolios' && (
          <div className="space-y-4">
            {/* Link new portfolio */}
            {availablePortfolios.length > 0 && (
              <div className="flex items-center gap-3">
                <select value={linkPortfolioId} onChange={(e) => setLinkPortfolioId(e.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none">
                  <option value="">Link a portfolio…</option>
                  {availablePortfolios.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} — {p.portfolio_strategy}
                    </option>
                  ))}
                </select>
                <button onClick={() => linkMutation.mutate()} disabled={!linkPortfolioId || linkMutation.isPending}
                  className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                  Link
                </button>
              </div>
            )}

            {clientPortfolios.length === 0 ? (
              <p className="text-sm text-gray-500">No portfolios linked yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Portfolio</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Strategy</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientPortfolios.map((cp) => (
                      <tr key={cp.id}>
                        <td className="px-4 py-3">
                          <button onClick={() => navigate(`/portfolio/${encodeURIComponent(cp.portfolio_name)}`)}
                            className="font-medium text-blue-600 hover:underline">{cp.portfolio_name}</button>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{cp.portfolio_strategy ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => unlinkMutation.mutate(cp.portfolio_name)}
                            className="text-xs text-red-500 hover:text-red-700">Unlink</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'communications' && (
          <div>
            <div className="mb-4 flex justify-end">
              <button onClick={() => setLogCommOpen(true)}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
                Log Communication
              </button>
            </div>
            <CommunicationTimeline clientId={id} />
          </div>
        )}

        {tab === 'actions' && (
          <div>
            <div className="mb-4 flex justify-end">
              <button onClick={() => setCreateActionOpen(true)}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
                New Action Item
              </button>
            </div>
            {actionItems.length === 0 ? (
              <p className="text-sm text-gray-500">No action items.</p>
            ) : (
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      {item.due_date && <p className="text-xs text-gray-500">Due {item.due_date}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge variant={item.priority} />
                      <StatusBadge variant={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'ips' && <IPSPanel clientId={id} />}

        {tab === 'household' && client.household_name && (
          <HouseholdView householdName={client.household_name} currentClientId={id} />
        )}
      </div>

      <LogCommunicationModal open={logCommOpen} onClose={() => setLogCommOpen(false)} clientId={id} />
      <CreateActionItemModal open={createActionOpen} onClose={() => setCreateActionOpen(false)} />
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchClients } from '@/lib/clients'
import { fetchPortfolios } from '@/lib/portfolio'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { CreateClientModal } from '@/components/CreateClientModal'
import type { Portfolio } from '@/types/portfolio'

export function ClientsPage() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.clients,
    queryFn: fetchClients,
  })

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: QUERY_KEYS.portfolios,
    queryFn: fetchPortfolios,
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Clients</h1>
          <p className="mt-1 text-gray-600">Manage client households and their portfolio assignments.</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
          Add Client
        </button>
      </div>

      {isLoading ? (
        <p className="mt-8 text-gray-500">Loading…</p>
      ) : clients.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-gray-500">No clients yet.</p>
          <button onClick={() => setCreateOpen(true)}
            className="mt-3 text-sm font-medium text-gray-700 underline">Add the first client</button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Name</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-900 sm:table-cell">Household</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-900 md:table-cell">Email</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-gray-900 sm:table-cell">Model Portfolio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {clients.map((client) => (
                <tr key={client.id} role="button" tabIndex={0}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/clients/${client.id}`)
                    }
                  }}
                  className="cursor-pointer hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                    {client.name}
                    {/* Show household inline on mobile when the column is hidden */}
                    {client.household_name && (
                      <span className="ml-1.5 text-xs font-normal text-gray-500 sm:hidden">({client.household_name})</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-700 sm:table-cell">{client.household_name ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-gray-700 md:table-cell">{client.email ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-gray-700 sm:table-cell">{client.model_portfolio_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        portfolios={portfolios}
      />
    </div>
  )
}

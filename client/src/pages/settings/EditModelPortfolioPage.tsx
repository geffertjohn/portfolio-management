import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchModelPortfolios, updateModelPortfolio } from '@/lib/modelPortfolios'
import type { ModelPortfolioInput } from '@/lib/modelPortfolios'
import { fetchModelPortfolioBenchmarkOptions } from '@/lib/benchmarks'
import { QUERY_KEYS } from '@/hooks/queryKeys'
import { DetailPageState } from '@/components/DetailPageState'
import { ModelPortfolioModal } from './ModelPortfolioModal'

/**
 * Dedicated page for editing a model portfolio (replaces the cramped modal for the
 * Edit flow). Reuses the ModelPortfolioModal form via its `asPage` prop. New-model
 * creation still uses the modal on the list page.
 */
export function EditModelPortfolioPage() {
  const { id } = useParams<{ id: string }>()
  const modelId = id ? parseInt(id, 10) : NaN
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: models = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolios,
    queryFn: fetchModelPortfolios,
  })
  const { data: benchmarkOptions = [] } = useQuery({
    queryKey: QUERY_KEYS.modelPortfolioBenchmarkOptions,
    queryFn: fetchModelPortfolioBenchmarkOptions,
  })

  const model = models.find((m) => m.id === modelId)
  const back = () => navigate('/settings/model-portfolios')

  const updateMutation = useMutation({
    mutationFn: (input: Partial<ModelPortfolioInput>) => updateModelPortfolio(modelId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modelPortfolios })
      back()
    },
  })

  if (isLoading || error || !model) {
    return (
      <DetailPageState
        backTo="/settings/model-portfolios"
        backLabel="← Back to Model Portfolios"
        loading={isLoading}
        error={error}
        notFound={!model}
        errorTitle="Failed to load model portfolios"
        notFoundText="Model portfolio not found."
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/settings/model-portfolios" className="text-sm text-gray-600 hover:text-gray-900">
        ← Back to Model Portfolios
      </Link>
      <div className="mt-4">
        <ModelPortfolioModal
          asPage
          initial={model}
          models={models}
          benchmarkOptions={benchmarkOptions}
          onSave={(input) => updateMutation.mutate(input)}
          onCancel={back}
          isPending={updateMutation.isPending}
          error={updateMutation.error as Error | null}
        />
      </div>
    </div>
  )
}

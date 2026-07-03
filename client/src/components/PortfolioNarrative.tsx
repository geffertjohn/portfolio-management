/**
 * The portfolio's strategy narrative on the detail header: a concise Description.
 * (Objective and Investment Philosophy were removed from the UI.)
 */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-2 text-gray-700">{children}</div>
    </div>
  )
}

export function PortfolioNarrative({
  description,
}: {
  description: string | null
}) {
  return <>{description && <Section label="Description">{description}</Section>}</>
}

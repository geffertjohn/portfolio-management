/**
 * The portfolio's strategy narrative on the detail header. Shows the Description,
 * or the Objective narrative for portfolios that no longer carry a Description
 * (e.g. Equity Income / Core Growth). The label follows the text passed in.
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
  text,
  label = 'Description',
}: {
  text: string | null
  label?: string
}) {
  return <>{text && <Section label={label}>{text}</Section>}</>
}

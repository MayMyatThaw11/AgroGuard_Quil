import { Crown } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'

export function planLabel(entitlements, t) {
  if (!entitlements) return ''
  if (entitlements.plan === 'pro') return t('plan.pro')
  return t('plan.freeLeft', { left: entitlements.farms_left, limit: entitlements.farms_limit })
}

export default function PlanChip({ entitlements, className = '' }) {
  const { t } = useLanguage()
  if (!entitlements) return null
  const pro = entitlements.plan === 'pro'
  return (
    <span
      data-testid="plan-chip"
      title={t('plan.tooltip')}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
        pro
          ? 'border-(--ag-accent) bg-(--ag-card-2) text-(--ag-accent)'
          : 'border-(--ag-line) bg-(--ag-card-2) text-(--ag-text)'
      } ${className}`}
    >
      {pro ? <Crown size={12} aria-hidden="true" /> : null}
      {planLabel(entitlements, t)}
    </span>
  )
}

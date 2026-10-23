import { Box } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext.jsx'

export default function SimulateOnFarmLink({ className = '' }) {
  const { t } = useLanguage()
  return (
    <Link
      to="/farm-simulation"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-(--ag-accent) px-5 py-3 text-sm font-bold text-(--ag-accent) transition hover:bg-(--ag-card-2) ${className}`}
    >
      <Box size={18} aria-hidden="true" />
      {t('upsell.simulate')}
    </Link>
  )
}

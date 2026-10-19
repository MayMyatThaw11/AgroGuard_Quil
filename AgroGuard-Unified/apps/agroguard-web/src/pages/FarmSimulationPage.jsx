import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext.jsx'

// Farm Simulation (formerly the AgriQill IDE) is its own page in this app,
// farmsim/index.html, built from src/features/farm-simulation. Showing it in a
// frame keeps its dark 3D workspace styles and keyboard shortcuts from leaking
// into AgroGuard's pages. The AgroGuard sidebar is hidden here (see
// DashboardLayout), so the thin bar on top is the way back to the dashboard.
// Query parameters pass through, so /farm-simulation?farm=<id> opens that farm,
// ?story opens the guided demo and ?field the field app.
function FarmSimulationPage() {
  const { search } = useLocation()
  const { t } = useLanguage()

  return (
    <div className="flex h-full flex-col bg-[#141a16]">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-white/10 px-3 text-[13px] text-slate-300">
        <Link
          id="farm-sim-back"
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {t('farmSim.back')}
        </Link>
        <span className="truncate text-slate-400">{t('nav.farmSimulation')}</span>
      </div>
      <iframe
        title={t('farmSim.frameTitle')}
        src={`/farmsim/${search}`}
        allow="fullscreen; clipboard-write"
        className="block min-h-0 w-full flex-1 border-0"
      />
    </div>
  )
}

export default FarmSimulationPage

import { useLocation } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext.jsx'

// Farm Simulation (formerly the AgriQill IDE) is its own page in this app,
// farmsim/index.html, built from src/features/farm-simulation. Showing it in a
// frame keeps its dark 3D workspace styles and keyboard shortcuts from leaking
// into AgroGuard's pages, while the AgroGuard sidebar stays on screen.
// Query parameters pass through, so /farm-simulation?farm=<id> opens that farm,
// ?story opens the guided demo and ?field the field app.
function FarmSimulationPage() {
  const { search } = useLocation()
  const { t } = useLanguage()

  return (
    <iframe
      title={t('farmSim.frameTitle')}
      src={`/farmsim/${search}`}
      allow="fullscreen; clipboard-write"
      className="block h-full w-full border-0 bg-[#0f1311]"
    />
  )
}

export default FarmSimulationPage

import { Home, LayoutDashboard, Radar, Sprout, ScanSearch, Bot, HeartPulse, Languages, RadioTower, ExternalLink, Box } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { AGRIQUILL_IDE_URL } from '../api.js'

const navItems = [
  { key: 'nav.landing', icon: Home, path: '/' },
  { key: 'nav.dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { key: 'nav.ndvi', icon: Radar, path: '/ndvi-analysis' },
  { key: 'nav.suggestion', icon: Sprout, path: '/crop-suggestion' },
  { key: 'nav.disease', icon: ScanSearch, path: '/disease-detection' },
  { key: 'nav.chat', icon: Bot, path: '/ai-chat' },
  { key: 'nav.iot', icon: RadioTower, path: '/iot-simulation' },
  { key: 'nav.updates', icon: HeartPulse, path: '/health-updates' },
  { key: 'nav.farmSimulation', icon: Box, path: '/farm-simulation' },
]

function Sidebar({ mobileSidebarOpen, onClose }) {
  const { language, setLanguage, t } = useLanguage()

  return (
    <aside
      className={`aq-sidebar fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden border-r border-white/70 bg-white/90 backdrop-blur-xl transition-transform duration-300 ease-out lg:translate-x-0 ${
        mobileSidebarOpen ? 'translate-x-0 shadow-2xl shadow-myanglow-navy/10' : '-translate-x-full'
      }`}
    >
      <div className="flex shrink-0 items-start justify-between border-b border-myanglow-sage/70 px-5 py-4">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.5em] text-myanglow-medium">AgroGuard</p>
          <h2 className="mt-1.5 text-2xl font-semibold text-myanglow-navy">{t('sidebar.title')}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t('sidebar.subtitle')}
          </p>
        </div>

        <button
          type="button"
          aria-label="Close sidebar"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-myanglow-sage text-myanglow-navy transition hover:bg-myanglow-sage/40 lg:hidden"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.key}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-myanglow-forest text-white shadow-lg shadow-myanglow-forest/20'
                    : 'text-slate-600 hover:bg-myanglow-sage/60 hover:text-myanglow-navy',
                ].join(' ')
              }
            >
              <Icon size={18} />
              <span>{t(item.key)}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-myanglow-sage/70 px-4 py-3">
        <a
          id="open-agriquill"
          href={AGRIQUILL_IDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open AgriQill IDE in a new tab"
          onClick={onClose}
          className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-myanglow-sage/60 hover:text-myanglow-navy"
        >
          <Sprout size={18} />
          <span className="flex-1">Open AgriQill IDE</span>
          <ExternalLink size={15} className="shrink-0 text-myanglow-medium" aria-hidden="true" />
        </a>
      </div>

      <div className="flex shrink-0 justify-center border-t border-myanglow-sage/70 px-4 py-3">
        <div className="inline-flex w-fit max-w-full items-center gap-1 rounded-xl border border-myanglow-sage bg-white p-1">
          <Languages size={16} className="shrink-0 text-myanglow-navy" />
          {['en', 'my'].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              className={`h-10 min-h-0 flex-none whitespace-nowrap rounded-lg px-2.5 py-0 text-[13px] font-medium leading-none transition sm:h-8 ${language === code ? 'bg-myanglow-forest text-white' : 'text-slate-600 hover:bg-myanglow-sage/40'}`}
            >
              {t(code === 'en' ? 'language.english' : 'language.burmese')}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar

import { CreditCard, Moon, Sun, Home, LayoutDashboard, Radar, Sprout, ScanSearch, Bot, HeartPulse, Languages, RadioTower, Box, LogOut, PanelLeftClose, PanelLeftOpen, Droplets, Scale } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { logout, useEntitlements } from '../lib/session.js'
import PlanChip from './PlanChip.jsx'

const navItems = [
  { key: 'nav.landing', icon: Home, path: '/' },
  { key: 'nav.dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { key: 'nav.ndvi', icon: Radar, path: '/ndvi-analysis' },
  { key: 'nav.suggestion', icon: Sprout, path: '/crop-suggestion' },
  { key: 'nav.disease', icon: ScanSearch, path: '/disease-detection' },
  { key: 'nav.water', icon: Droplets, path: '/water-management' },
  { key: 'nav.chat', icon: Bot, path: '/ai-chat' },
  { key: 'nav.council', icon: Scale, path: '/council', badge: 'Beta' },
  { key: 'nav.iot', icon: RadioTower, path: '/iot-simulation' },
  { key: 'nav.updates', icon: HeartPulse, path: '/health-updates' },
  { key: 'nav.farmSimulation', icon: Box, path: '/farm-simulation' },
  { key: 'nav.pricing', icon: CreditCard, path: '/pricing' },
]

function Sidebar({ mobileSidebarOpen, collapsed, onClose, onToggleCollapsed }) {
  const { language, setLanguage, t } = useLanguage()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { entitlements } = useEntitlements()
  const themeLabel = t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')
  // Classes that only apply on desktop while the sidebar is an icon rail.
  const rail = (classes) => (collapsed ? classes : '')
  const toggleLabel = t(collapsed ? 'nav.showSidebar' : 'nav.hideSidebar')

  function signOut() {
    logout()
    onClose()
    navigate('/')
  }

  return (
    <aside
      className={`aq-sidebar fixed inset-y-0 left-0 z-40 flex w-72 ${rail('lg:w-16')} flex-col overflow-hidden border-r border-(--ag-line) bg-white backdrop-blur-xl transition-[transform,width] duration-300 ease-out lg:translate-x-0 ${
        mobileSidebarOpen ? 'translate-x-0 shadow-2xl shadow-myanglow-navy/10' : '-translate-x-full'
      }`}
    >
      <div className={`flex shrink-0 items-start justify-between border-b border-myanglow-sage/70 px-5 py-4 ${rail('lg:justify-center lg:px-0')}`}>
        <div className={rail('lg:hidden')}>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.5em] text-myanglow-medium">AgroGuard</p>
          <h2 className="mt-1.5 text-2xl font-semibold text-myanglow-navy">{t('sidebar.title')}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t('sidebar.subtitle')}
          </p>
        </div>

        <button
          type="button"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!collapsed}
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-myanglow-sage text-myanglow-navy transition hover:bg-myanglow-sage/40 lg:inline-flex"
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <button
          type="button"
          aria-label="Close sidebar"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-myanglow-sage text-myanglow-navy transition hover:bg-myanglow-sage/40 lg:hidden"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <nav className={`min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3 ${rail('lg:px-2')}`}>
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.key}
              to={item.path}
              onClick={onClose}
              title={collapsed ? t(item.key) : undefined}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  rail('lg:justify-center lg:px-0'),
                  isActive
                    ? 'bg-mint-200 text-myanglow-forest font-semibold'
                    : 'text-slate-600 hover:bg-myanglow-sage/60 hover:text-myanglow-navy',
                ].join(' ')
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className={rail('lg:sr-only')}>{t(item.key)}</span>
              {item.badge && (
                <span
                  className={`ml-auto rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 ${rail('lg:hidden')}`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className={`shrink-0 border-t border-myanglow-sage/70 px-4 py-3 ${rail('lg:px-2')}`}>
        {entitlements ? (
          <div className={`mb-2 px-4 ${rail('lg:hidden')}`}>
            <PlanChip entitlements={entitlements} />
          </div>
        ) : null}
        <button
          id="sign-out"
          type="button"
          onClick={signOut}
          title={collapsed ? t('nav.signOut') : undefined}
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 ${rail('lg:justify-center lg:px-0')} text-left text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-red-50 hover:text-red-700`}
        >
          <LogOut size={18} className="shrink-0" />
          {/* App.css sets "button { font: inherit }", which outranks the button's
              own text-sm, so the label sets its size like the links above. */}
          <span className={`text-sm font-medium ${rail('lg:sr-only')}`}>{t('nav.signOut')}</span>
        </button>
      </div>

      <div className={`flex shrink-0 items-center justify-center gap-2 border-t border-myanglow-sage/70 px-4 py-3 ${rail('lg:hidden')}`}>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={themeLabel}
          title={themeLabel}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-myanglow-sage bg-white text-myanglow-navy transition hover:bg-myanglow-sage/40"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="inline-flex w-fit max-w-full items-center gap-1 rounded-xl border border-myanglow-sage bg-white p-1">
          <Languages size={16} className="shrink-0 text-myanglow-navy" />
          {['en', 'my'].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              className={`h-10 min-h-0 flex-none whitespace-nowrap rounded-lg px-2.5 py-0 text-[13px] font-medium leading-none transition sm:h-8 ${language === code ? 'bg-mint-200 text-myanglow-forest' : 'text-slate-600 hover:bg-myanglow-sage/40'}`}
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

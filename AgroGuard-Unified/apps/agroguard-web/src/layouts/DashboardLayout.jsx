import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'

const SIDEBAR_COLLAPSED_KEY = 'agroguard.sidebarCollapsed'

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function DashboardLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  // Desktop only: the sidebar can shrink to an icon rail to give pages more
  // width. The choice is remembered across visits.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const location = useLocation()
  // Farm Simulation has its own toolbars, so it takes the whole screen with no
  // AgroGuard sidebar; its page carries a "Back to dashboard" bar instead.
  const fullScreen = location.pathname === '/farm-simulation'

  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname])

  function toggleSidebarCollapsed() {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  }

  if (fullScreen) {
    return (
      <main className="h-screen">
        <Outlet />
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f6f3] text-slate-900">
      <Sidebar
        mobileSidebarOpen={mobileSidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setMobileSidebarOpen(false)}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      {mobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <div className={`transition-[padding] duration-300 ease-out ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-72'}`}>
        <button
          type="button"
          aria-label="Open sidebar"
          className="fixed left-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-myanglow-sage bg-white text-myanglow-navy shadow-sm transition hover:border-myanglow-soft hover:bg-myanglow-sage/40 lg:hidden"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>

        <main className="px-4 pb-6 pt-20 sm:px-6 lg:px-8 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout

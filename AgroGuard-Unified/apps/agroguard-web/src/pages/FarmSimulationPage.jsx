import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import CheckoutModal from '../components/CheckoutModal.jsx'
import PlanChip from '../components/PlanChip.jsx'
import { buyerKind } from '../lib/account.js'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { useEntitlements } from '../lib/session.js'

// Farm Simulation (formerly the AgriQill IDE) is its own page in this app,
// farmsim/index.html, built from src/features/farm-simulation. Showing it in a
// frame keeps its dark 3D workspace styles and keyboard shortcuts from leaking
// into AgroGuard's pages. The AgroGuard sidebar is hidden here (see
// DashboardLayout), so the thin bar on top is the way back to the dashboard.
// Query parameters pass through, so /farm-simulation?farm=<id> opens that farm,
// ?story opens the guided demo and ?field the field app.
// The frame tells this page when a run was counted (aq:run-complete) or refused
// because the free farms are used up (aq:limit-reached).
function FarmSimulationPage() {
  const { search } = useLocation()
  const { t } = useLanguage()
  const { entitlements, signedIn, refresh } = useEntitlements()
  const params = new URLSearchParams(search)
  const openToAll = params.has('story') || params.has('field')
  const [checkout, setCheckout] = useState(false)
  const coop = buyerKind() === 'cooperative'
  const frame = useRef(null)

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== frame.current?.contentWindow) return
      const type = event.data?.type
      if (type === 'aq:run-complete') refresh()
      if (type === 'aq:limit-reached') {
        refresh()
        setCheckout(true)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refresh])

  const paid = async () => {
    await refresh()
    frame.current?.contentWindow?.postMessage({ type: 'aq:plan-changed' }, window.location.origin)
  }

  if (!signedIn && !openToAll) return <Navigate to="/" replace />

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
        <span className="ml-auto flex items-center gap-2">
          <PlanChip entitlements={entitlements} />
          {entitlements && entitlements.plan !== 'pro' && entitlements.plan !== 'coop_season' ? (
            <button
              type="button"
              onClick={() => setCheckout(true)}
              className="whitespace-nowrap rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-600"
            >
              {t(coop ? 'plan.coop.choose' : 'plan.upgrade')}
            </button>
          ) : null}
        </span>
      </div>
      <iframe
        ref={frame}
        title={t('farmSim.frameTitle')}
        src={`/farmsim/${search}`}
        allow="fullscreen; clipboard-write"
        className="block min-h-0 w-full flex-1 border-0"
      />
      {checkout ? <CheckoutModal plan={coop ? 'coop_season' : 'pro'} onClose={() => setCheckout(false)} onPaid={paid} /> : null}
    </div>
  )
}

export default FarmSimulationPage

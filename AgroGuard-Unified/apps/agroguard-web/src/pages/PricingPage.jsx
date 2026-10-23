import { useState } from 'react'
import { Check } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import CheckoutModal from '../components/CheckoutModal.jsx'
import PlanChip from '../components/PlanChip.jsx'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { authFetch, useEntitlements } from '../lib/session.js'

function PricingPage() {
  const { t } = useLanguage()
  const { entitlements, signedIn, refresh } = useEntitlements()
  const [checkout, setCheckout] = useState(false)
  const pro = entitlements?.plan === 'pro'

  const demoTools = new URLSearchParams(useLocation().search).has('demo')

  const resetDemo = async () => {
    await authFetch('/admin/demo/reset', { method: 'POST' })
    await refresh()
  }

  const cancel = async () => {
    await authFetch('/billing/cancel', { method: 'POST' })
    await refresh()
  }

  const card = 'flex flex-col rounded-3xl border border-(--ag-line) bg-(--ag-card) p-6'
  const cta =
    'inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 text-sm font-bold transition'

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-(--ag-text)">{t('pricing.title')}</h1>
        <PlanChip entitlements={entitlements} />
      </div>
      <p className="mt-2 text-sm text-(--ag-muted)">{t('pricing.subtitle')}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="text-lg font-semibold text-(--ag-text)">{t('pricing.freeName')}</h2>
          <p className="mt-1 text-3xl font-bold text-(--ag-text)">$0</p>
          <ul className="mt-4 space-y-2 text-sm text-(--ag-text)">
            {['free1', 'free2', 'free3'].map((key) => (
              <li key={key} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-(--ag-accent)" aria-hidden="true" />
                {t(`pricing.${key}`)}
              </li>
            ))}
          </ul>
        </section>

        <section className={`${card} border-(--ag-accent)`}>
          <h2 className="text-lg font-semibold text-(--ag-text)">{t('pricing.proName')}</h2>
          <p className="mt-1 text-3xl font-bold text-(--ag-text)">
            $9<span className="text-sm font-medium text-(--ag-muted)"> {t('pricing.perMonth')}</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-(--ag-text)">
            {['pro1', 'pro2', 'pro3'].map((key) => (
              <li key={key} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-(--ag-accent)" aria-hidden="true" />
                {t(`pricing.${key}`)}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {!signedIn ? (
              <Link to="/" className={`${cta} bg-(--ag-accent) text-(--ag-bg)`}>
                {t('pricing.signIn')}
              </Link>
            ) : pro ? (
              <button type="button" onClick={cancel} className={`${cta} border border-(--ag-line) text-(--ag-text) hover:bg-(--ag-card-2)`}>
                {t('pricing.cancel')}
              </button>
            ) : (
              <button type="button" onClick={() => setCheckout(true)} className={`${cta} w-full bg-(--ag-accent) text-(--ag-bg) hover:opacity-90`}>
                {t('pricing.subscribe')}
              </button>
            )}
          </div>
        </section>
      </div>

      {demoTools && signedIn ? (
        <button type="button" onClick={resetDemo} className="mt-6 text-xs font-semibold text-(--ag-muted) underline-offset-4 hover:underline">
          {t('pricing.reset')}
        </button>
      ) : null}

      {checkout ? <CheckoutModal onClose={() => setCheckout(false)} onPaid={refresh} /> : null}
    </div>
  )
}

export default PricingPage

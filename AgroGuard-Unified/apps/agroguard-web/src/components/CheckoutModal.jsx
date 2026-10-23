import { useState } from 'react'
import { CheckCircle2, CreditCard, Loader2, X } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { authFetch } from '../lib/session.js'
import {
  TEST_SUCCESS_CARD,
  formatCardNumber,
  formatExpiry,
  parseExpiry,
  validateCheckout,
} from '../lib/checkout.js'

const input =
  'w-full rounded-xl border border-(--ag-line) bg-(--ag-card-2) px-3 py-2.5 text-sm text-(--ag-text) focus:border-(--ag-accent) focus:outline-none'

export default function CheckoutModal({ onClose, onPaid }) {
  const { t } = useLanguage()
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [errors, setErrors] = useState({})
  const [phase, setPhase] = useState('idle')
  const [message, setMessage] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const found = validateCheckout({ number, expiry, cvc })
    setErrors(found)
    if (Object.keys(found).length) return
    setPhase('processing')
    setMessage('')
    try {
      const parsed = parseExpiry(expiry)
      const response = await authFetch('/billing/mock-checkout', {
        method: 'POST',
        body: JSON.stringify({
          card_number: number,
          exp_month: parsed.month,
          exp_year: parsed.year,
          cvc,
        }),
      })
      if (response.ok) {
        setPhase('success')
        await onPaid?.()
        return
      }
      setPhase('idle')
      if (response.status === 402) setMessage(t('checkout.declined'))
      else if (response.status === 404) setMessage(t('checkout.unavailable'))
      else if (response.status === 401) setMessage(t('checkout.signIn'))
      else {
        const body = await response.json().catch(() => null)
        setMessage(typeof body?.detail === 'string' ? body.detail : t('checkout.failed'))
      }
    } catch {
      setPhase('idle')
      setMessage(t('checkout.failed'))
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"
      onMouseDown={phase === 'processing' ? undefined : onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('checkout.title')}
        className="relative w-full max-w-md rounded-3xl border border-(--ag-line) bg-(--ag-card) p-6 text-(--ag-text) shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('checkout.close')}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl text-(--ag-muted) hover:bg-(--ag-card-2)"
        >
          <X size={18} />
        </button>

        {phase === 'success' ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={44} className="mx-auto text-(--ag-accent)" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-semibold">{t('checkout.successTitle')}</h2>
            <p className="mt-2 text-sm text-(--ag-muted)">{t('checkout.successBody')}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-(--ag-accent) px-6 py-2.5 text-sm font-bold text-(--ag-bg)"
            >
              {t('checkout.done')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="flex items-center gap-3">
              <CreditCard size={22} className="text-(--ag-accent)" aria-hidden="true" />
              <h2 className="text-xl font-semibold">{t('checkout.title')}</h2>
            </div>
            <p className="rounded-xl bg-(--ag-card-2) px-3 py-2 text-xs text-(--ag-muted)">
              {t('checkout.testHint', { card: TEST_SUCCESS_CARD })}
            </p>

            <div>
              <label htmlFor="co-number" className="mb-1 block text-xs font-semibold text-(--ag-muted)">
                {t('checkout.number')}
              </label>
              <input
                id="co-number"
                className={input}
                inputMode="numeric"
                autoComplete="off"
                value={number}
                onChange={(e) => setNumber(formatCardNumber(e.target.value))}
                placeholder="4242 4242 4242 4242"
              />
              {errors.number ? <p role="alert" className="mt-1 text-xs font-semibold text-(--ag-warn)">{t(errors.number)}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="co-expiry" className="mb-1 block text-xs font-semibold text-(--ag-muted)">
                  {t('checkout.expiry')}
                </label>
                <input
                  id="co-expiry"
                  className={input}
                  inputMode="numeric"
                  autoComplete="off"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                />
                {errors.expiry ? <p role="alert" className="mt-1 text-xs font-semibold text-(--ag-warn)">{t(errors.expiry)}</p> : null}
              </div>
              <div>
                <label htmlFor="co-cvc" className="mb-1 block text-xs font-semibold text-(--ag-muted)">
                  {t('checkout.cvc')}
                </label>
                <input
                  id="co-cvc"
                  className={input}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="123"
                />
                {errors.cvc ? <p role="alert" className="mt-1 text-xs font-semibold text-(--ag-warn)">{t(errors.cvc)}</p> : null}
              </div>
            </div>

            {message ? (
              <p role="alert" className="text-sm font-semibold text-(--ag-warn)">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={phase === 'processing'}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-(--ag-accent) px-5 py-3 text-sm font-bold text-(--ag-bg) transition hover:opacity-90 disabled:opacity-60"
            >
              {phase === 'processing' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {phase === 'processing' ? t('checkout.processing') : t('checkout.pay')}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

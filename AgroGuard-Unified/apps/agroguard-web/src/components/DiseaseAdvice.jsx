import { useEffect, useState } from 'react'
import { FlaskConical, ShieldAlert, Sprout, Wrench } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { API_BASE_URL } from '../api.js'

// What to do about a detected disease, from /disease-advice: things to do first, how to feed
// the crop, and a spray tier that the server only sends once an agronomist has signed the
// disease off. It never shows a dose. A class with no advice (healthy, not a plant) shows nothing.

function Block({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl bg-(--ag-card-2) p-4">
      <h4 className="flex items-center gap-2 text-sm font-bold text-(--ag-text)">
        <Icon size={16} className="text-(--ag-accent)" aria-hidden="true" />
        {title}
      </h4>
      {children}
    </section>
  )
}

function List({ items }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-(--ag-muted)">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export default function DiseaseAdvice({ rawClassName }) {
  const { t, language } = useLanguage()
  const [advice, setAdvice] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | none | failed

  useEffect(() => {
    if (!rawClassName) {
      setState('none')
      return undefined
    }
    const controller = new AbortController()
    setState('loading')
    const query = new URLSearchParams({ class_name: rawClassName, language })
    fetch(`${API_BASE_URL}/disease-advice?${query}`, { signal: controller.signal })
      .then((response) => {
        if (response.status === 404) return null
        return response.ok ? response.json() : Promise.reject(new Error(String(response.status)))
      })
      .then((data) => {
        setAdvice(data)
        setState(data ? 'ready' : 'none')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState('failed')
      })
    return () => controller.abort()
  }, [rawClassName, language])

  if (state === 'none') return null
  if (state === 'loading') return <p className="text-sm text-(--ag-muted)">{t('advice.loading')}</p>
  if (state === 'failed') {
    return <p role="alert" className="text-sm text-(--ag-warn)">{t('advice.failed')}</p>
  }

  const { spray } = advice
  return (
    <div className="space-y-3 rounded-[1.5rem] border border-(--ag-line) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-(--ag-text)">{t('advice.title')}</h3>
        <span className="rounded-full bg-(--ag-card-2) px-3 py-1 text-xs font-semibold text-(--ag-muted)">
          {t('advice.cause')}: {advice.causeLabel}
        </span>
      </div>

      <Block icon={Wrench} title={t('advice.doFirst')}>
        <List items={advice.steps} />
      </Block>

      <Block icon={Sprout} title={t('advice.feeding')}>
        <p className="mt-2 text-sm leading-6 text-(--ag-text)">{advice.decision.fertilizerRecommendation}</p>
      </Block>

      <Block icon={FlaskConical} title={t('advice.spray')}>
        <p className="mt-2 text-sm font-semibold leading-6 text-(--ag-text)">{advice.decision.sprayRecommendation}</p>
        {spray.status === 'shown' && (
          <>
            <p className="mt-3 text-sm font-semibold text-(--ag-text)">{t('advice.whenToSpray')}</p>
            <List items={spray.when} />
            <p className="mt-3 text-sm text-(--ag-muted)">{t('advice.sprayIntro')}</p>
            <ul className="mt-2 space-y-2 text-sm text-(--ag-text)">
              {spray.kinds.map((kind) => (
                <li key={kind.label}>
                  <span className="font-semibold">{kind.label}</span>
                  <span className="block text-xs text-(--ag-muted)">
                    {t('advice.examples')}: {kind.ingredients.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border border-(--ag-warn-line) bg-(--ag-warn-bg) p-3 text-sm text-(--ag-warn)">
              <p className="flex items-center gap-2 font-bold">
                <ShieldAlert size={16} aria-hidden="true" />
                {t('advice.safety')}
              </p>
              <List items={spray.safety} />
            </div>
          </>
        )}
        {spray.status === 'awaiting_review' && <p className="mt-2 text-sm text-(--ag-muted)">{t('advice.sprayAwaiting')}</p>}
      </Block>

      <p className="text-xs text-(--ag-muted)">{advice.disclaimer}</p>
    </div>
  )
}

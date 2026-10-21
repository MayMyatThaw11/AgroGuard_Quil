import { AlertTriangle, CheckCircle2, HelpCircle, ImageOff } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'

// The headline of a disease result, in words that match how sure the model is: "Looks
// like X, fairly sure", "Possibly X, not very sure", or "Not sure, ask your agronomist".
// Colour is never the only signal: every state has a title and an icon.
export default function DiseaseVerdict({ verdict, result, onRetake }) {
  const { t } = useLanguage()

  if (verdict.kind === 'not_a_plant') {
    return (
      <Banner tone="amber" icon={ImageOff} title={t('photo.notPlantTitle')}>
        <p>{t('photo.notPlantBody')}</p>
        <p>{t('photo.tips')}</p>
        {onRetake && <RetakeButton onClick={onRetake} label={t('photo.retake')} />}
      </Banner>
    )
  }

  if (verdict.kind === 'unsure') {
    return (
      <Banner tone="amber" icon={HelpCircle} title={t('photo.unsureTitle')}>
        <p>{t('photo.unsureBody')}</p>
        {verdict.poorPhoto && <p>{t('photo.poorPhotoNote')}</p>}
        <p>{t('photo.tips')}</p>
        {onRetake && <RetakeButton onClick={onRetake} label={t('photo.retake')} />}
      </Banner>
    )
  }

  const sure = verdict.kind === 'confident'
  const subject = verdict.healthy ? t('photo.healthy') : result.detectedDisease
  const lead = sure ? t('photo.looksLike') : t('photo.possibly')
  const how = sure ? t('photo.fairlySure') : t('photo.notVerySure')
  return (
    <Banner
      tone={sure ? 'emerald' : 'amber'}
      icon={sure ? CheckCircle2 : AlertTriangle}
      title={`${lead} ${result.plantName}, ${subject} · ${how}`}
    >
      {verdict.poorPhoto && <p>{t('photo.poorPhotoNote')}</p>}
      <p>{t('photo.scoreNote')}</p>
    </Banner>
  )
}

const TONES = {
  emerald: { box: 'border-emerald-300 bg-emerald-50', icon: 'text-emerald-700', title: 'text-emerald-900' },
  amber: { box: 'border-amber-300 bg-amber-50', icon: 'text-amber-700', title: 'text-amber-900' },
}

function Banner({ tone, icon: Icon, title, children }) {
  const style = TONES[tone]
  return (
    <div className={`space-y-2 rounded-[1.5rem] border p-4 ${style.box}`} role="status">
      <div className="flex items-start gap-3">
        <Icon size={22} className={`mt-0.5 shrink-0 ${style.icon}`} aria-hidden="true" />
        <h3 className={`text-lg font-semibold ${style.title}`}>{title}</h3>
      </div>
      <div className="space-y-2 pl-9 text-sm leading-6 text-slate-700">{children}</div>
    </div>
  )
}

function RetakeButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
    >
      {label}
    </button>
  )
}

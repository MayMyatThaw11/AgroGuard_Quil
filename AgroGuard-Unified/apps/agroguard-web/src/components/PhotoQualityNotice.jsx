import { Camera, ImageOff } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'

// Shown instead of a diagnosis when the photo failed the quality check: says what is
// wrong in plain words, how to retake it, and lets the person carry on regardless.
export default function PhotoQualityNotice({ quality, onRetake, onUseAnyway }) {
  const { t } = useLanguage()
  return (
    <div className="space-y-4 rounded-[1.5rem] border border-amber-300 bg-amber-50 p-5" role="alert">
      <div className="flex items-center gap-3">
        <ImageOff size={22} className="shrink-0 text-amber-700" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-amber-900">{t('photo.qualityTitle')}</h3>
      </div>
      <ul className="list-disc space-y-1 pl-6 text-sm text-amber-900">
        {quality.reasons.map((reason) => (
          <li key={reason}>{t(`photo.q.${reason}`)}</li>
        ))}
      </ul>
      <p className="text-sm leading-6 text-slate-700">{t('photo.tips')}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          <Camera size={16} aria-hidden="true" />
          {t('photo.retake')}
        </button>
        <button
          type="button"
          onClick={onUseAnyway}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {t('photo.useAnyway')}
        </button>
      </div>
    </div>
  )
}

import { AlertTriangle, CircleHelp, Clock, Satellite, WifiOff } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext.jsx'

// Shared, honest status/provenance UI used by Fertilizer Management, Water
// Management, Satellite Monitoring and Export Quality. Every number shown by
// those pages must be tagged with one of these so a user can tell measured
// data from a user-entered guess from a feature that simply isn't built yet.
// Fully bilingual: default labels come from the shared `common.*` i18n keys;
// `title`/`detail` text is passed in already-translated by the calling page.

const PROVENANCE_KEY = {
  measured: 'common.provenance.measured',
  modelled: 'common.provenance.modelled',
  user_entered: 'common.provenance.userEntered',
  demo: 'common.provenance.demo',
  unavailable: 'common.provenance.unavailable',
}

const PROVENANCE_CLASS = {
  measured: 'provenance-tag is-measured',
  modelled: 'provenance-tag is-modelled',
  user_entered: 'provenance-tag is-user',
  demo: 'provenance-tag is-demo',
  unavailable: 'provenance-tag is-unavailable',
}

export function ProvenanceTag({ kind, children }) {
  const { t } = useLanguage()
  const label = children || t(PROVENANCE_KEY[kind] || PROVENANCE_KEY.unavailable)
  return <span className={PROVENANCE_CLASS[kind] || PROVENANCE_CLASS.unavailable}>{label}</span>
}

// A section of a page that depends on a backend capability that does not
// exist yet. Always says so plainly instead of rendering an empty chart or a
// fabricated number. `detail` should name the missing route/table so the gap
// is traceable back to FRONTEND_BACKEND_DEPENDENCIES.md.
export function BackendBlockedNotice({ title, detail }) {
  return (
    <div className="backend-blocked-notice" role="status">
      <CircleHelp size={20} className="backend-blocked-icon" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

export function PlannedNotice({ title, detail }) {
  return (
    <div className="backend-blocked-notice is-planned" role="status">
      <Clock size={20} className="backend-blocked-icon" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

export function ApiErrorNotice({ message, onRetry }) {
  const { t } = useLanguage()
  return (
    <div className="api-error" role="alert">
      <div className="api-error-row">
        <AlertTriangle size={18} aria-hidden="true" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-outline" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

export function DemoDataNotice() {
  const { t } = useLanguage()
  return (
    <div className="demo-data-notice" role="note">
      <Satellite size={16} aria-hidden="true" />
      <span>{t('common.demoNotice')}</span>
    </div>
  )
}

// A real offline state: distinct from an API error, and distinct from
// "still loading" — tells the user cached/last-known data is being shown,
// not live data.
export function OfflineNotice() {
  const { t } = useLanguage()
  return (
    <div className="offline-notice" role="status">
      <WifiOff size={18} aria-hidden="true" />
      <span>{t('common.offline')}</span>
    </div>
  )
}

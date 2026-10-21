import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Loader2, RefreshCw, X } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'

// Live camera capture in a modal. Hands the captured frame back as a JPEG
// File, so it goes through the same validation and upload path as a file the
// user picked or dropped. Needs a secure context: getUserMedia works on
// https:// and on localhost, but not on a plain http:// LAN address.
export default function CameraCapture({ onCapture, onClose }) {
  const { t } = useLanguage()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facing, setFacing] = useState('environment') // rear camera first: this is for photographing plants
  const [status, setStatus] = useState('starting') // starting | live | error
  const [errorKey, setErrorKey] = useState('')
  const [canSwitch, setCanSwitch] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      setStatus('starting')
      stopStream()
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorKey('disease.cameraUnavailable')
        setStatus('error')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
        if (!cancelled) {
          setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1)
          setStatus('live')
        }
      } catch (error) {
        if (cancelled) return
        const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        setErrorKey(denied ? 'disease.cameraDenied' : 'disease.cameraUnavailable')
        setStatus('error')
      }
    }

    start()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [facing, stopStream])

  // Escape closes the modal, as for any dialog.
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        onCapture(new File([blob], `camera-${stamp}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('disease.cameraTitle')}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-[1.5rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold text-myanglow-navy">{t('disease.cameraTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('disease.cameraClose')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${status === 'live' ? '' : 'invisible'}`}
          />
          {status === 'live' && (
            <>
              <div
                className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-dashed border-white/80"
                aria-hidden="true"
              />
              <p className="pointer-events-none absolute inset-x-0 bottom-2 px-4 text-center text-xs text-white drop-shadow">
                {t('photo.frame')}
              </p>
            </>
          )}
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
              <Loader2 size={18} className="animate-spin" /> {t('disease.cameraStarting')}
            </div>
          )}
          {status === 'error' && (
            <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
              {t(errorKey)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="max-w-[16rem] text-xs text-slate-500">{t('disease.cameraTip')}</p>
          <div className="flex items-center gap-2">
            {canSwitch && (
              <button
                type="button"
                onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} /> {t('disease.cameraSwitch')}
              </button>
            )}
            <button
              type="button"
              onClick={capture}
              disabled={status !== 'live'}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Camera size={16} /> {t('disease.cameraCapture')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

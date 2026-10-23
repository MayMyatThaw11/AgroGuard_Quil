import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  ImagePlus,
  Camera,
  Info,
  Layers,
  Loader2,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  UploadCloud,
  X,
} from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { API_BASE_URL } from '../api.js'
import CameraCapture from '../components/CameraCapture.jsx'
import DiseaseVerdict from '../components/DiseaseVerdict.jsx'
import PhotoQualityNotice from '../components/PhotoQualityNotice.jsx'
import DiseaseAdvice from '../components/DiseaseAdvice.jsx'
import SaveToHealthUpdates from '../components/SaveToHealthUpdates.jsx'
import SimulateOnFarmLink from '../components/SimulateOnFarmLink.jsx'
import { interpretDisease } from '../lib/diseaseVerdict.js'
import { checkPhotoQuality } from '../lib/photoQuality.js'
import { PLANT_GROUPS } from '../data/plantGroups.js'

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxFileSize = 8 * 1024 * 1024
const GUIDE_STORAGE_KEY = 'myanglow_plant_group_guide_seen_v1'

function SectionCard({ title, action, children, className = '' }) {
  return (
    <section
      className={`rounded-[2rem] border border-(--ag-line) bg-white p-5 shadow-[0_20px_60px_rgba(20,26,22,0.08)] backdrop-blur-xl sm:p-6 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-myanglow-navy sm:text-xl">{title}</h2>
        {action ? <div>{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function DiseaseDetectionPage() {
  // Fetch both t() and language ('en' or 'my') from LanguageContext.jsx
  const { t, language } = useLanguage()
  const langKey = language === 'my' ? 'my' : 'en'

  const inputRef = useRef(null)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedCrop, setSelectedCrop] = useState('')
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [guideSearch, setGuideSearch] = useState('')

  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [validationError, setValidationError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  // The photo-quality check: the last report (kept so a poor photo weakens the verdict),
  // and the report currently blocking the analysis until the person retakes or carries on.
  const [photoQuality, setPhotoQuality] = useState(null)
  const [qualityIssue, setQualityIssue] = useState(null)
  // What the disease service can diagnose: { [groupId]: { available, crops: { [cropId]: leafAndFruit } } }.
  // Null until it answers, and the full PLANT_GROUPS list shows meanwhile.
  const [groupSupport, setGroupSupport] = useState(null)
  // The five steps: 1 plant, 2 photo, 3 checking, 4 result, 5 what to do.
  const [step, setStep] = useState(1)
  // Whether this check was already added to Health Updates.
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE_URL}/ml/groups`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.groups) return
        const support = {}
        data.groups.forEach((group) => {
          support[group.id] = {
            available: group.available,
            crops: Object.fromEntries(group.crops.map((crop) => [crop.id, crop.leafAndFruit])),
          }
        })
        setGroupSupport(support)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // The plant groups and crops the backend models actually cover.
  const plantGroups = useMemo(() => {
    if (!groupSupport) return PLANT_GROUPS.map((group) => ({ ...group, available: true }))
    return PLANT_GROUPS.map((group) => {
      const support = groupSupport[group.id]
      if (!support) return { ...group, available: false }
      return {
        ...group,
        available: support.available,
        crops: group.crops.filter((crop) => crop.id in support.crops),
        supportsFruitSplit: group.crops
          .filter((crop) => support.crops[crop.id])
          .map((crop) => crop.id),
      }
    })
  }, [groupSupport])

  // Show startup guide on first visit
  useEffect(() => {
    try {
      const hasSeenGuide = window.localStorage.getItem(GUIDE_STORAGE_KEY)
      if (!hasSeenGuide) {
        setIsGuideOpen(true)
      }
    } catch {
      setIsGuideOpen(true)
    }
  }, [])

  const handleCloseGuide = () => {
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, 'true')
    } catch {
      // ignore storage errors
    }
    setIsGuideOpen(false)
  }

  const handleSelectGroupFromGuide = (groupId, cropId = '') => {
    if (plantGroups.find((g) => g.id === groupId)?.available === false) return
    setSelectedGroup(groupId)
    setSelectedCrop(cropId)
    setValidationError('')
    setAnalysisResult(null)
    handleCloseGuide()
  }

  const activeGroupObj = useMemo(
    () => plantGroups.find((g) => g.id === selectedGroup) || null,
    [plantGroups, selectedGroup]
  )

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('')
      return undefined
    }

    const nextPreview = URL.createObjectURL(selectedFile)
    setPreviewUrl(nextPreview)
    setAnalysisResult(null)

    return () => {
      URL.revokeObjectURL(nextPreview)
    }
  }, [selectedFile])

  // Automatically re-fetch translated result if user switches English <-> Burmese while viewing a result
  useEffect(() => {
    if (analysisResult && selectedFile && selectedGroup && !isAnalyzing) {
      runPredictionRequest(selectedFile, selectedGroup, selectedCrop, language, { skipQuality: true })
    }
  }, [language])

  // Step 3 hands over by itself: to the result when the answer arrives, or back to the photo
  // step when the check failed (the error message is already set).
  useEffect(() => {
    if (step !== 3 || isAnalyzing) return
    if (analysisResult) setStep(4)
    else if (!qualityIssue) setStep(2)
  }, [step, isAnalyzing, analysisResult, qualityIssue])

  const filteredGuideGroups = useMemo(() => {
    const q = guideSearch.trim().toLowerCase()
    if (!q) return plantGroups
    return plantGroups.filter(
      (g) =>
        g.name.en.toLowerCase().includes(q) ||
        g.name.my.includes(q) ||
        g.crops.some(
          (c) => c.en.toLowerCase().includes(q) || c.my.includes(q)
        )
    )
  }, [guideSearch, plantGroups])

  const handleGroupClick = (groupId) => {
    if (plantGroups.find((g) => g.id === groupId)?.available === false) return
    if (selectedGroup !== groupId) {
      setSelectedGroup(groupId)
      setSelectedCrop('')
      setAnalysisResult(null)
      setValidationError('')
    }
  }

  // One path for every way an image can arrive (file picker, drag and drop,
  // camera capture): same type and size checks, same state updates.
  const acceptFile = (nextFile) => {
    if (!nextFile) return false

    if (!acceptedTypes.includes(nextFile.type)) {
      setValidationError(
        langKey === 'my'
          ? 'ကျေးဇူးပြု၍ JPG, PNG သို့မဟုတ် WEBP ပုံကိုသာ တင်ပါ။'
          : 'Please upload a JPG, PNG, or WEBP plant image.'
      )
      setSelectedFile(null)
      return false
    }

    if (nextFile.size > maxFileSize) {
      setValidationError(
        langKey === 'my'
          ? 'ကျေးဇူးပြု၍ 8 MB အောက်သာရှိသော ပုံကို ရွေးချယ်ပါ။'
          : 'Please choose an image smaller than 8 MB.'
      )
      setSelectedFile(null)
      return false
    }

    setValidationError('')
    setSelectedFile(nextFile)
    setAnalysisResult(null)
    setPhotoQuality(null)
    setQualityIssue(null)
    return true
  }

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return
    if (!acceptFile(nextFile)) event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    const dropped = event.dataTransfer?.files?.[0]
    if (!dropped) return
    if (inputRef.current) inputRef.current.value = ''
    acceptFile(dropped)
  }

  const handleDragOver = (event) => {
    // Without preventDefault the browser refuses the drop and opens the image instead.
    event.preventDefault()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (event) => {
    // dragleave also fires when moving onto a child element; only clear when leaving the zone.
    if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false)
  }

  const handleCameraCapture = (file) => {
    setIsCameraOpen(false)
    if (inputRef.current) inputRef.current.value = ''
    acceptFile(file)
  }

  const runPredictionRequest = async (fileToUse, groupToUse, cropToUse, activeLang, options = {}) => {
    setValidationError('')
    setIsAnalyzing(true)

    try {
      // Look at the photo before asking the model: a blurry, dark or blank picture gets a
      // retake prompt, not a confident wrong answer. If the check itself is unavailable
      // (null) the analysis goes ahead as before.
      if (!options.skipQuality) {
        const quality = await checkPhotoQuality(fileToUse)
        setPhotoQuality(quality)
        if (quality && !quality.ok) {
          setQualityIssue(quality)
          setAnalysisResult(null)
          return
        }
        setQualityIssue(null)
      }

      const formData = new FormData()
      formData.append('file', fileToUse)
      formData.append('group_id', groupToUse)
      formData.append('language', activeLang) // <-- Sends 'en' or 'my' from LanguageContext
      if (cropToUse) {
        formData.append('crop_name', cropToUse)
      }

      const response = await fetch(`${API_BASE_URL}/ml/predict`, {
        method: 'POST',
        headers: {
          'Accept-Language': activeLang,
        },
        body: formData,
      })

      if (!response.ok) {
        // The service explains 400/503 errors, e.g. a group whose model is not trained yet.
        const body = await response.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail : '')
      }

      const data = await response.json()
      setAnalysisResult(data)
    } catch (error) {
      console.error('Analysis error:', error)
      setValidationError(
        activeLang === 'my'
          ? 'ပုံကို စစ်ဆေးရာတွင် အမှားအယွင်းရှိနေပါသည်။ ထပ်မံကြိုးစားကြည့်ပါ။'
          : error.message || 'Failed to analyze the image. Please try again.'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleAnalyze = async () => {
    if (!selectedGroup) {
      setValidationError(
        langKey === 'my'
          ? 'ပုံမစစ်ဆေးမီ သင့်အပင်အုပ်စုကို အရင်ရွေးချယ်ပါ။'
          : 'Please choose a plant group before analyzing the image.'
      )
      return
    }

    if (!selectedFile) {
      setValidationError(
        langKey === 'my'
          ? 'စစ်ဆေးရန် အပင် သို့မဟုတ် အရွက်ပုံ အရင်တင်ပါ။'
          : 'Upload an image before analyzing the plant.'
      )
      return
    }

    setStep(3)
    await runPredictionRequest(selectedFile, selectedGroup, selectedCrop, language)
  }

  // Back to choosing a photo. If the bad photo came from the camera, reopen the camera.
  const handleRetake = () => {
    const fromCamera = selectedFile?.name?.startsWith('camera-')
    setSelectedFile(null)
    setPhotoQuality(null)
    setQualityIssue(null)
    setAnalysisResult(null)
    if (inputRef.current) inputRef.current.value = ''
    setSaved(false)
    setStep(2)
    if (fromCamera) setIsCameraOpen(true)
  }

  const handleUseAnyway = () => {
    setQualityIssue(null)
    runPredictionRequest(selectedFile, selectedGroup, selectedCrop, language, { skipQuality: true })
  }

  const handleReset = () => {
    setSelectedGroup('')
    setSelectedCrop('')
    setSelectedFile(null)
    setPhotoQuality(null)
    setQualityIssue(null)
    setPreviewUrl('')
    setValidationError('')
    setIsAnalyzing(false)
    setAnalysisResult(null)
    setSaved(false)
    setStep(1)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const verdict = analysisResult ? interpretDisease(analysisResult, photoQuality) : null

  const scoreGradient = analysisResult
    ? {
        background: `conic-gradient(#17aa51 0 ${analysisResult.healthScore}%, rgba(154, 163, 157, 0.35) ${analysisResult.healthScore}% 100%)`,
      }
    : undefined

  const stepLabels = [
    t('wizard.plant'),
    t('wizard.photo'),
    t('wizard.check'),
    t('wizard.result'),
    t('wizard.action'),
  ]
  const goToStep = (n) => {
    if (n === 4 && !analysisResult) return
    setStep(n)
  }
  const primaryButton =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-(--ag-accent) px-6 py-3 text-sm font-bold text-(--ag-bg) transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
  const quietButton =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-(--ag-line) bg-transparent px-5 py-3 text-sm font-semibold text-(--ag-text) transition hover:bg-(--ag-card-2) disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="space-y-5">
      {/* HERO HEADER */}
      <section className="rounded-[2rem] border border-(--ag-line) bg-white p-5 shadow-[0_20px_60px_rgba(20,26,22,0.08)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-myanglow-medium">
              {t('disease.title')}
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-myanglow-navy sm:text-4xl">
              {t('disease.hero')}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              {t('disease.subtitle')}
            </p>
          </div>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="inline-flex items-center gap-2.5 rounded-2xl border border-myanglow-sage bg-myanglow-sage/30 px-4 py-3 text-sm font-semibold text-myanglow-navy shadow-sm transition hover:border-myanglow-medium hover:bg-myanglow-sage/50"
            >
              <BookOpen size={18} className="text-myanglow-forest" />
              <span>{t('disease.guideBtn')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* STEP BAR */}
      <nav aria-label={t('wizard.progress')} className="flex gap-2">
        {stepLabels.map((label, index) => {
          const n = index + 1
          const done = n < step
          const here = n === step
          const clickable = done && n !== 3
          return (
            <button
              key={n}
              type="button"
              disabled={!clickable}
              onClick={() => goToStep(n)}
              aria-current={here ? 'step' : undefined}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-2 py-2.5 text-sm font-semibold transition sm:justify-start sm:px-3 ${
                here ? 'border-(--ag-accent) bg-white' : 'border-(--ag-line)'
              } ${!done && !here ? 'opacity-60' : ''} disabled:cursor-default`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  done || here ? 'bg-(--ag-accent) text-(--ag-bg)' : 'bg-(--ag-card-2) text-(--ag-muted)'
                }`}
              >
                {done ? '✓' : n}
              </span>
              <span className="hidden text-(--ag-text) sm:inline">{label}</span>
            </button>
          )
        })}
      </nav>

      {/* STEP 1: PLANT GROUP AND CROP */}
      {step === 1 ? (
        <SectionCard
          title={t('disease.chooseGroupTitle')}
          action={
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-myanglow-forest underline-offset-4 hover:underline sm:text-sm"
            >
              <HelpCircle size={16} />
              <span>{t('disease.notSureGuide')}</span>
            </button>
          }
        >
          <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {plantGroups.map((group) => {
              const isSelected = selectedGroup === group.id
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleGroupClick(group.id)}
                  disabled={!group.available}
                  className={`flex h-full min-h-28 flex-col justify-between rounded-[1.4rem] border p-4 text-left transition ${
                    !group.available
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                      : isSelected
                      ? 'border-myanglow-forest bg-myanglow-sage/35 ring-2 ring-myanglow-forest/20'
                      : 'border-myanglow-sage/70 bg-white hover:border-myanglow-medium hover:bg-myanglow-sage/15'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-myanglow-forest/10 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-myanglow-forest">
                        {group.shortTitle[langKey]}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 size={18} className="text-myanglow-forest" />
                      ) : (
                        <Layers size={16} className="text-slate-400" />
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-semibold leading-snug text-myanglow-navy">
                      {group.name[langKey]}
                    </h3>
                    {!group.available ? (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">
                        {t('disease.modelNotReady')}
                      </p>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>

          {activeGroupObj ? (
            <div className="mt-4 rounded-2xl border border-myanglow-sage/80 bg-myanglow-sage/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-myanglow-forest">
                {t('disease.selectedGroup')}: {activeGroupObj.name[langKey]}
              </p>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                <strong>{t('disease.photoTip')}</strong> {activeGroupObj.organTip[langKey]}
              </p>

              <p className="mt-4 text-xs font-semibold text-slate-500">{t('disease.specifyCrop')}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {[{ id: '', label: t('disease.allGroupCrops') }, ...activeGroupObj.crops.map((crop) => ({
                  id: crop.id,
                  label:
                    crop[langKey] +
                    (activeGroupObj.supportsFruitSplit.includes(crop.id)
                      ? ` (${t('disease.leafFruit')})`
                      : ''),
                }))].map((option) => (
                  <button
                    key={option.id || 'all'}
                    type="button"
                    onClick={() => setSelectedCrop(option.id)}
                    className={`flex min-h-12 w-full items-center justify-center rounded-xl px-3 py-2 text-center text-sm font-semibold leading-tight transition ${
                      selectedCrop === option.id
                        ? 'bg-(--ag-accent) text-(--ag-bg)'
                        : 'border border-(--ag-line) bg-white text-myanglow-navy hover:bg-myanglow-sage/40'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!selectedGroup}
              className={primaryButton}
            >
              {t('wizard.nextPhoto')}
            </button>
          </div>
        </SectionCard>
      ) : null}

      {/* STEP 2: PHOTO */}
      {step === 2 ? (
        <SectionCard title={t('disease.upload')}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <label
              htmlFor="plant-image"
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`group flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-6 text-center transition ${
                isDragging
                  ? 'border-myanglow-medium bg-myanglow-sage/50'
                  : 'border-myanglow-sage bg-(--ag-card-2) hover:border-myanglow-medium hover:bg-myanglow-sage/30'
              }`}
            >
              <input
                ref={inputRef}
                id="plant-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-myanglow-forest/10 text-myanglow-forest transition group-hover:bg-myanglow-forest/15">
                <ImagePlus size={28} />
              </div>
              <p className="mt-4 text-lg font-semibold text-myanglow-navy">
                {isDragging ? t('disease.dropHere') : t('disease.uploadPrompt')}
              </p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">{t('disease.formats')}</p>
              <p className="mt-2 text-xs text-slate-500">{t('disease.orDrag')}</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-emerald-600">
                  <UploadCloud size={16} />
                  {t('disease.choose')}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    // Inside the <label>: don't let this click also open the file dialog.
                    event.preventDefault()
                    event.stopPropagation()
                    setIsCameraOpen(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  <Camera size={16} />
                  {t('disease.useCamera')}
                </button>
              </div>
            </label>

            <div className="overflow-hidden rounded-[1.5rem] border border-myanglow-sage/70 bg-white p-4">
              <div className="flex items-center justify-between gap-3 border-b border-myanglow-sage/60 pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-myanglow-medium">
                    {t('disease.preview')}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedFile ? selectedFile.name : t('disease.noImage')}
                  </p>
                </div>
                <span className="rounded-full bg-myanglow-sage/50 px-3 py-1 text-xs font-semibold text-myanglow-darkGreen">
                  {selectedFile ? t('disease.ready') : t('disease.waiting')}
                </span>
              </div>

              <div className="mt-4 flex min-h-[18rem] items-center justify-center rounded-[1.3rem] bg-(--ag-card-2) p-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Plant preview"
                    className="max-h-[18rem] w-full rounded-[1rem] object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex max-w-sm flex-col items-center text-center text-slate-500">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-myanglow-medium shadow-sm">
                      <ScanSearch size={28} />
                    </div>
                    <p className="mt-4 text-lg font-semibold text-myanglow-navy">
                      {t('disease.previewHere')}
                    </p>
                    <p className="mt-2 text-sm leading-6">{t('disease.previewHelp')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeGroupObj ? (
            <p className="mt-4 rounded-2xl bg-(--ag-card-2) px-4 py-3 text-sm text-slate-600">
              <strong>{t('disease.photoTip')}</strong> {activeGroupObj.organTip[langKey]}
            </p>
          ) : null}

          {validationError ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>{validationError}</p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setStep(1)} className={quietButton}>
              {t('wizard.back')}
            </button>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!selectedGroup || !selectedFile || isAnalyzing}
              className={primaryButton}
            >
              <Sparkles size={18} />
              {t('wizard.checkPlant')}
            </button>
          </div>
        </SectionCard>
      ) : null}

      {/* STEP 3: CHECKING */}
      {step === 3 ? (
        <SectionCard title={t('wizard.checkTitle')}>
          {qualityIssue && !isAnalyzing ? (
            <PhotoQualityNotice quality={qualityIssue} onRetake={handleRetake} onUseAnyway={handleUseAnyway} />
          ) : (
            <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[1.5rem] border border-myanglow-sage/70 bg-myanglow-sage/20 px-6 py-10 text-center">
              <Loader2 size={34} className="animate-spin text-myanglow-forest" />
              <p className="mt-4 text-lg font-semibold text-myanglow-navy">{t('disease.analyzing')}</p>
              <p className="mt-1 text-sm text-slate-600">{t('wizard.checkHelp')}</p>
              <ul className="mt-5 space-y-1.5 text-sm text-slate-600">
                <li>{t('wizard.checkItemQuality')}</li>
                <li>{t('wizard.checkItemPlant')}</li>
                <li>{t('wizard.checkItemCompare')}</li>
              </ul>
            </div>
          )}
        </SectionCard>
      ) : null}

      {/* STEP 4: RESULT */}
      {step === 4 && analysisResult ? (
        <SectionCard title={t('disease.result')}>
          <div className="space-y-5">
            <DiseaseVerdict verdict={verdict} result={analysisResult} onRetake={handleRetake} />
            {verdict.showDetails && (
              <>
                <div className="flex flex-col gap-5 rounded-[1.5rem] border border-myanglow-sage/70 bg-white p-4 sm:flex-row sm:items-center">
                  <div className="flex shrink-0 items-center justify-center">
                    <div
                      className="relative flex h-40 w-40 items-center justify-center rounded-full p-3"
                      style={scoreGradient}
                    >
                      <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white shadow-inner shadow-myanglow-sage/40">
                        <span className="text-4xl font-semibold text-myanglow-navy">
                          {analysisResult.healthScore}
                        </span>
                        <span className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          {t('disease.healthScoreLabel')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 text-center sm:text-left">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-myanglow-medium">
                      {t('disease.healthSummary')}
                    </p>
                    <h3 className="text-2xl font-semibold text-myanglow-navy">
                      {analysisResult.plantName}
                    </h3>
                    <p className="text-sm italic text-slate-500">{analysisResult.scientificName}</p>
                    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                      <span className="rounded-full bg-myanglow-sage/60 px-3 py-1 text-xs font-semibold text-myanglow-darkGreen">
                        {analysisResult.healthStatus}
                      </span>
                      <span className="rounded-full bg-myanglow-lime/20 px-3 py-1 text-xs font-semibold text-myanglow-forest">
                        {t('disease.detectedDiseaseLabel')}: {analysisResult.detectedDisease}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-myanglow-navy ring-1 ring-myanglow-sage">
                        {t('disease.confidenceLabel')} {analysisResult.confidenceScore}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard label={t('disease.severityLabel')} value={analysisResult.diseaseSeverity} />
                  <InfoCard
                    label={t('disease.affectedAreaLabel')}
                    value={analysisResult.estimatedAffectedArea}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <DetailPanel
                    title={t('disease.symptomsTitle')}
                    items={analysisResult.visibleSymptoms}
                    accent="text-myanglow-forest"
                  />
                  <DetailPanel
                    title={t('disease.causesTitle')}
                    items={analysisResult.possibleCauses}
                    accent="text-myanglow-darkGreen"
                  />
                  <DetailPanel
                    title={t('disease.preventionTitle')}
                    items={analysisResult.preventionRecommendations}
                    accent="text-myanglow-muted"
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-5">
            <SaveToHealthUpdates
              file={selectedFile}
              result={analysisResult}
              verdict={verdict}
              groupId={selectedGroup}
              saved={saved}
              onSaved={() => setSaved(true)}
            />
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={handleRetake} className={quietButton}>
              {t('wizard.retake')}
            </button>
            {verdict.showDetails ? (
              <button type="button" onClick={() => setStep(5)} className={primaryButton}>
                {t('wizard.seeAction')}
              </button>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {/* STEP 5: WHAT TO DO */}
      {step === 5 && analysisResult ? (
        <SectionCard title={t('wizard.action')}>
          <DiseaseAdvice rawClassName={analysisResult.rawClassName} />

          <div className="mt-5">
            <SaveToHealthUpdates
              file={selectedFile}
              result={analysisResult}
              verdict={verdict}
              groupId={selectedGroup}
              saved={saved}
              onSaved={() => setSaved(true)}
            />
          </div>
          <div className="mt-3">
            <SimulateOnFarmLink />
          </div>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setStep(4)} className={quietButton}>
              {t('wizard.back')}
            </button>
            <button type="button" onClick={handleReset} className={primaryButton}>
              {t('wizard.another')}
            </button>
          </div>
        </SectionCard>
      ) : null}

      {/* BILINGUAL GROUP SELECTION GUIDE MODAL */}
      {isGuideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-myanglow-sage/60 bg-myanglow-sage/25 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-myanglow-forest text-white">
                  <Sprout size={22} />
                </div>
                <div>
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-myanglow-forest">
                    {langKey === 'my' ? 'အသုံးပြုပုံ လမ်းညွှန်' : 'Quick Start Guide'}
                  </span>
                  <h3 className="mt-1 text-xl font-semibold text-myanglow-navy sm:text-2xl">
                    {langKey === 'my'
                      ? 'မှန်ကန်သော အပင်အုပ်စု ရွေးချယ်နည်း'
                      : 'How to Choose the Right Plant Group'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {langKey === 'my'
                      ? 'ပိုမိုတိကျစေရန် အပင်အုပ်စု (၅) ခု ခွဲထားပါသည်။ သင်စစ်ဆေးလိုသော သီးနှံကို နှိပ်၍ တိုက်ရိုက်ရွေးချယ်နိုင်ပါသည်။'
                      : 'Our AI uses 5 specialized models for higher accuracy. Click your crop below to select its group automatically.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseGuide}
                className="rounded-full bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-myanglow-navy"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-myanglow-sage/40 bg-white px-6 py-3">
              <div className="relative">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={guideSearch}
                  onChange={(e) => setGuideSearch(e.target.value)}
                  placeholder={
                    langKey === 'my'
                      ? 'သီးနှံအမည်ဖြင့် ရှာဖွေပါ (ဥပမာ - စပါး၊ သရက်၊ ဒူးရင်း၊ လက်ဖက်၊ ခရမ်းချဉ်)...'
                      : 'Search for your crop (e.g., Rice, Mango, Durian, Tea, Tomato)...'
                  }
                  className="w-full rounded-xl border border-myanglow-sage bg-myanglow-sage/10 py-2.5 pl-10 pr-4 text-sm text-myanglow-navy placeholder-slate-400 focus:border-myanglow-forest focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-2">
                {filteredGuideGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex flex-col justify-between rounded-2xl border border-myanglow-sage/80 bg-white p-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-myanglow-forest/10 px-3 py-1 text-xs font-semibold text-myanglow-forest">
                          {group.shortTitle[langKey]}
                        </span>
                        {group.available ? (
                          <button
                            type="button"
                            onClick={() => handleSelectGroupFromGuide(group.id)}
                            className="text-xs font-semibold text-myanglow-forest hover:underline"
                          >
                            {group.shortTitle[langKey]} {langKey === 'my' ? 'ရွေးရန်' : 'Select'} &rarr;
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-amber-700">
                            {t('disease.modelNotReady')}
                          </span>
                        )}
                      </div>

                      <h4 className="mt-2.5 text-base font-semibold text-myanglow-navy">
                        {group.name[langKey]}
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {group.description[langKey]}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {group.crops.map((crop) => {
                          const hasFruitSplit =
                            group.supportsFruitSplit.includes(crop.id)
                          return (
                            <button
                              key={crop.id}
                              type="button"
                              onClick={() =>
                                handleSelectGroupFromGuide(group.id, crop.id)
                              }
                              disabled={!group.available}
                              className="inline-flex disabled:cursor-not-allowed disabled:opacity-60 items-center gap-1 rounded-lg border border-myanglow-sage bg-white px-2.5 py-1 text-xs font-semibold text-myanglow-navy transition hover:border-myanglow-forest hover:bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 hover:text-white"
                            >
                              <span>{crop[langKey]}</span>
                              {hasFruitSplit ? (
                                <span className="rounded bg-myanglow-lime/30 px-1 text-[0.65rem] text-myanglow-darkGreen">
                                  {t('disease.leafFruit')}
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-2.5 text-xs text-slate-600">
                      <Info
                        size={15}
                        className="mt-0.5 shrink-0 text-myanglow-medium"
                      />
                      <span>{group.organTip[langKey]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-myanglow-sage/60 bg-slate-50 px-6 py-4 sm:flex-row">
              <p className="text-xs text-slate-500">
                {langKey === 'my'
                  ? 'စာမျက်နှာထိပ်ရှိ "အပင်အုပ်စု ရွေးချယ်မှုလမ်းညွှန်" ခလုတ်ကို နှိပ်၍ အချိန်မရွေး ပြန်ကြည့်နိုင်ပါသည်။'
                  : 'You can reopen this guide anytime using the "Group Selection Guide" button at the top.'}
              </p>
              <button
                type="button"
                onClick={handleCloseGuide}
                className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 sm:w-auto"
              >
                {langKey === 'my' ? 'နားလည်ပါပြီ၊ စတင်မည်' : 'Got It, Start Detecting'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCameraOpen && (
        <CameraCapture onCapture={handleCameraCapture} onClose={() => setIsCameraOpen(false)} />
      )}
    </div>
  )
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-myanglow-sage/70 bg-white px-4 py-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-myanglow-medium">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-myanglow-navy">{value}</p>
    </div>
  )
}

function DetailPanel({ title, items = [], accent }) {
  return (
    <section className="rounded-2xl border border-myanglow-sage/70 bg-white p-4">
      <p className={`text-sm font-semibold ${accent}`}>{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 size={16} className={`mt-1 shrink-0 ${accent}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default DiseaseDetectionPage

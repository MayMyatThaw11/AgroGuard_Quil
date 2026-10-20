import { useRef, useState } from 'react'
import { Camera, UploadCloud } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { ACCEPTED_IMAGE_TYPES, checkImageFile } from '../lib/imageFile.js'
import CameraCapture from './CameraCapture.jsx'

// Photo input with three ways in: pick a file, drag and drop, or take a live
// photo. Every path ends in onFile(file) for a valid image, or onInvalid(reason)
// ('type' | 'size') for a refused one. The parent owns the file and its preview;
// remount with a new `key` to clear the underlying <input>.
export default function PhotoPicker({ onFile, onInvalid, disabled = false, inputId = 'photo-picker' }) {
  const { t } = useLanguage()
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)

  const accept = (file) => {
    if (!file) return
    const problem = checkImageFile(file)
    if (problem) {
      onInvalid?.(problem)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    onFile(file)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    if (disabled) return
    if (inputRef.current) inputRef.current.value = ''
    accept(event.dataTransfer?.files?.[0])
  }

  const handleDragOver = (event) => {
    // Without preventDefault the browser refuses the drop and opens the image instead.
    event.preventDefault()
    if (!disabled && !isDragging) setIsDragging(true)
  }

  const handleDragLeave = (event) => {
    // dragleave also fires when moving onto a child; only clear when leaving the zone.
    if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false)
  }

  return (
    <>
      <label
        htmlFor={inputId}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`photo-picker ${isDragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          className="photo-picker-input"
          disabled={disabled}
          onChange={(event) => accept(event.target.files?.[0])}
        />
        <p className="photo-picker-title">{isDragging ? t('disease.dropHere') : t('disease.orDrag')}</p>
        <div className="photo-picker-actions">
          <span className="photo-picker-btn is-primary">
            <UploadCloud size={16} aria-hidden="true" />
            {t('disease.choose')}
          </span>
          <button
            type="button"
            className="photo-picker-btn"
            disabled={disabled}
            onClick={(event) => {
              // Inside the <label>: don't let this click also open the file dialog.
              event.preventDefault()
              event.stopPropagation()
              setIsCameraOpen(true)
            }}
          >
            <Camera size={16} aria-hidden="true" />
            {t('disease.useCamera')}
          </button>
        </div>
      </label>

      {isCameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            setIsCameraOpen(false)
            if (inputRef.current) inputRef.current.value = ''
            accept(file)
          }}
          onClose={() => setIsCameraOpen(false)}
        />
      )}
    </>
  )
}

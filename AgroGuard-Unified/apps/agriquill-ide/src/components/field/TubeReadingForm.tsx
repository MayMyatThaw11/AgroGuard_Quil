import React, { useState } from 'react';
import { Droplets } from 'lucide-react';
import type { QueuedItem } from '../../lib/fieldQueue.ts';
import { newId } from '../../lib/useFieldQueue.ts';
import { photoToBase64 } from '../../lib/photo.ts';
import { useT } from '../../lib/i18n.ts';

interface TubeReadingFormProps {
  deviceId: string;
  label: string;
  reporter: string;
  onQueue: (item: QueuedItem) => void;
  readOnly?: boolean;
}

export const TubeReadingForm: React.FC<TubeReadingFormProps> = ({ deviceId, label, reporter, onQueue, readOnly = false }) => {
  const t = useT();
  const [depth, setDepth] = useState('');
  const [wind, setWind] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const pickPhoto = async (file: File | undefined) => {
    setPhotoError(null);
    if (!file) return setPhoto(null);
    try {
      setPhoto(await photoToBase64(file));
    } catch {
      setPhoto(null);
      setPhotoError(t('tube.photoError'));
    }
  };
  const depthValue = Number(depth);
  const windValue = Number(wind);
  const depthOk = depth.trim() !== '' && Number.isFinite(depthValue) && depthValue >= -40 && depthValue <= 30;
  const windOk = wind.trim() === '' || (Number.isFinite(windValue) && windValue >= 0 && windValue <= 60);
  const ready = depthOk && windOk && reporter.trim().length > 0 && !readOnly;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    const values: Record<string, number> = { water_depth_cm: depthValue };
    if (wind.trim() !== '') values.wind_ms = windValue;
    const observedAt = new Date().toISOString();
    onQueue({
      id: newId(),
      kind: 'reading',
      queuedAt: observedAt,
      body: {
        device_id: deviceId,
        observed_at: observedAt,
        values,
        reporter: reporter.trim(),
        ...(photo ? { photo_base64: photo } : {}),
      },
    });
    setNote(t(photo ? 'tube.savedPhoto' : 'tube.saved', { cm: depthValue, time: new Date(observedAt).toLocaleTimeString() }));
    setDepth('');
    setWind('');
    setPhoto(null);
  };

  return (
    <form className="space-y-2" onSubmit={submit} aria-label={t('tube.form', { label })}>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-(--ops-ink-2)">
          {t('tube.depth')}
          <input
            className="ops-input mt-1"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={-40}
            max={30}
            required
            value={depth}
            aria-invalid={depth !== '' && !depthOk}
            onChange={(e) => setDepth(e.target.value)}
          />
        </label>
        <label className="block text-[11px] text-(--ops-ink-2)">
          {t('tube.wind')}
          <input
            className="ops-input mt-1"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            max={60}
            value={wind}
            aria-invalid={!windOk}
            onChange={(e) => setWind(e.target.value)}
          />
        </label>
      </div>
      <label className="block text-[11px] text-(--ops-ink-2)">
        {t('tube.photo')}
        <input
          className="ops-input mt-1"
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
        />
      </label>
      {photoError && (
        <p className="text-[11px] text-(--ops-red)" role="alert">
          {photoError}
        </p>
      )}
      <p className="text-[11px] text-(--ops-ink-3)">
        {t('tube.hint', { device: deviceId })}
        {reporter.trim() ? '' : ` ${t('tube.nameFirst')}`}
      </p>
      <button type="submit" className="ops-btn is-primary w-full" disabled={!ready}>
        <Droplets className="w-3.5 h-3.5" /> {readOnly ? t('prop.signIn') : t('tube.log')}
      </button>
      {note && (
        <p className="text-[11px] text-(--ops-green-deep)" role="status">
          {note}
        </p>
      )}
    </form>
  );
};

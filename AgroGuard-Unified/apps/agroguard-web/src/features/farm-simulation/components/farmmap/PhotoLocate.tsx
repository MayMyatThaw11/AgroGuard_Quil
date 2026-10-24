import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { readPhotoLocation } from '../../lib/farmmap/photoLocation.ts';
import { useT } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

const EXIF_BYTES = 131072;

export const PhotoLocate: React.FC<{ onFound: (lat: number, lon: number) => void }> = ({ onFound }) => {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const pick = async (file: File) => {
    const out = readPhotoLocation(await file.slice(0, EXIF_BYTES).arrayBuffer());
    if (out.ok) {
      setNote({ error: false, text: t('farmMap.photo.found', { lat: out.lat.toFixed(5), lon: out.lon.toFixed(5) }) });
      onFound(out.lat, out.lon);
    } else {
      setNote({ error: true, text: t(out.reason === 'not-jpeg' ? 'farmMap.photo.notJpeg' : 'farmMap.photo.noGps') });
    }
  };
  return (
    <>
      <AqButton onClick={() => input.current?.click()}>
        <Camera size={14} aria-hidden="true" />{t('farmMap.photo.button')}
      </AqButton>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/jpeg"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void pick(file);
        }}
      />
      <p className="aq-fm-note">{t('farmMap.photo.hint')}</p>
      {note ? <div className={`aq-alert ${note.error ? 'is-error' : 'is-success'}`} role={note.error ? 'alert' : 'status'}>{note.text}</div> : null}
    </>
  );
};

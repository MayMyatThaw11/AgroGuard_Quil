export interface Sun {
  elevationDeg: number;
  azimuthDeg: number;
}

const RAD = Math.PI / 180;

// NOAA solar position (low-precision form): about 0.5 degree, which is plenty for lighting a map.
export function sunAt(lat: number, lon: number, when: Date): Sun {
  const day = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()) / 86400000 - Date.UTC(when.getUTCFullYear(), 0, 1) / 86400000 + 1;
  const hours = when.getUTCHours() + when.getUTCMinutes() / 60 + when.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (day - 1 + (hours - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolarMin = (hours * 60 + eqTime + 4 * lon + 1440) % 1440;
  const hourAngle = (trueSolarMin / 4 - 180) * RAD;
  const latR = lat * RAD;
  const cosZenith = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const sinZ = Math.sin(zenith) || 1e-9;
  const cosAz = -(Math.sin(latR) * Math.cos(zenith) - Math.sin(decl)) / (Math.cos(latR) * sinZ);
  const az = Math.acos(Math.min(1, Math.max(-1, cosAz))) / RAD;
  return { elevationDeg: 90 - zenith / RAD, azimuthDeg: hourAngle > 0 ? (360 - az) % 360 : az };
}

export interface MapLight {
  anchor: 'map';
  position: [number, number, number];
  intensity: number;
  color: string;
}

const NIGHT_INTENSITY = 0.12;

export function lightFor(lat: number, lon: number, when: Date): MapLight {
  const sun = sunAt(lat, lon, when);
  const up = Math.max(0, sun.elevationDeg);
  return {
    anchor: 'map',
    position: [1.5, Math.round(sun.azimuthDeg), Math.round(90 - Math.min(up, 85))],
    intensity: sun.elevationDeg <= 0 ? NIGHT_INTENSITY : Math.min(0.55, NIGHT_INTENSITY + (up / 60) * 0.43),
    color: up < 12 ? '#ffd9a8' : '#ffffff',
  };
}

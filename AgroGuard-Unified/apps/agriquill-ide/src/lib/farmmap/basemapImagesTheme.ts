export interface StyleImage {
  data: ImageData;
  pixelRatio: number;
}

const SCALE = 2;

function canvas(width: number, height: number): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  const cv = document.createElement('canvas');
  cv.width = width * SCALE;
  cv.height = height * SCALE;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.scale(SCALE, SCALE);
  return { cv, g };
}

function wave(): StyleImage | null {
  const c = canvas(48, 18);
  if (!c) return null;
  const { cv, g } = c;
  g.strokeStyle = 'rgba(255,255,255,.75)';
  g.lineWidth = 1.4;
  g.lineCap = 'round';
  [[4, 6], [28, 14]].forEach(([x, y]) => {
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 4, y - 4, x + 8, y);
    g.quadraticCurveTo(x + 12, y + 4, x + 16, y);
    g.stroke();
  });
  return { data: g.getImageData(0, 0, cv.width, cv.height), pixelRatio: SCALE };
}

function tree(): StyleImage | null {
  const c = canvas(18, 18);
  if (!c) return null;
  const { cv, g } = c;
  g.fillStyle = '#7a5a35';
  g.fillRect(8.2, 11, 1.6, 5);
  g.fillStyle = '#4fa35f';
  g.beginPath();
  g.arc(9, 7.5, 5.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#6cbf72';
  g.beginPath();
  g.arc(7.6, 6.2, 2.6, 0, Math.PI * 2);
  g.fill();
  return { data: g.getImageData(0, 0, cv.width, cv.height), pixelRatio: SCALE };
}

function paddy(): StyleImage | null {
  const c = canvas(16, 16);
  if (!c) return null;
  const { cv, g } = c;
  g.strokeStyle = '#8fae3f';
  g.lineWidth = 1.3;
  g.lineCap = 'round';
  [[8, 2], [4.5, 4], [11.5, 4]].forEach(([x, y]) => {
    g.beginPath();
    g.moveTo(8, 14);
    g.quadraticCurveTo(8, 9, x, y);
    g.stroke();
  });
  return { data: g.getImageData(0, 0, cv.width, cv.height), pixelRatio: SCALE };
}

function peak(): StyleImage | null {
  const c = canvas(14, 14);
  if (!c) return null;
  const { cv, g } = c;
  g.fillStyle = '#8a7356';
  g.beginPath();
  g.moveTo(7, 2);
  g.lineTo(12.5, 12);
  g.lineTo(1.5, 12);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(7, 2);
  g.lineTo(8.8, 5.3);
  g.lineTo(5.2, 5.3);
  g.closePath();
  g.fill();
  return { data: g.getImageData(0, 0, cv.width, cv.height), pixelRatio: SCALE };
}

const BUILDERS: Record<string, () => StyleImage | null> = { 'aq-wave': wave, 'aq-tree': tree, 'aq-paddy': paddy, 'aq-peak': peak };

export function basemapImage(id: string): StyleImage | null {
  const build = BUILDERS[id];
  return build ? build() : null;
}

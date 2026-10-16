/**
 * Procedural satellite-style overlay.
 *
 * HONESTY, stated up front: no Sentinel-2 product is fetched, no STAC query
 * runs, and there is no backend route that could. `backend/app/api/v1` has 42
 * routes and none of them return imagery; NDVI there is read from a bundled
 * static CSV. So this texture is SYNTHETIC and is drawn with a repeating
 * "DEMO" watermark that is deliberately part of the image data, not a CSS
 * overlay, so it survives a screenshot of the canvas alone.
 *
 * What it does model is the *structure* a real optical scene has at paddy
 * parcel scale: rectangular field blocks at differing growth stages, bunds
 * between them, a dendritic drainage network, and settlement clusters. That
 * structure is what makes a raking-light 3D view legible, and it is what the
 * parcel polygon and flood extent are evaluated against.
 */

export interface ImageryOptions {
  readonly size: number;
  readonly seed: number;
  /** Cadastral grid divisions across the tile. Retained for call compatibility. */
  readonly blockCount: number;
  readonly drainageDepth: number;
}

/**
 * Off-field ground. Deliberately a desaturated dark olive-brown: it must read as
 * uncultivated margin and bund, not as bare black. Pure black here was what made
 * the gaps between field blocks read as holes in the raster.
 */
const GROUND_BASE: readonly [number, number, number] = [0.185, 0.2, 0.155];
const BUND_COLOUR = 'rgba(206, 196, 166, 0.38)';

/** Multi-stop ramp sampled per field block to fake differing canopy maturity. */
/**
 * Canopy maturity stops. Values are dark enough to survive the multiply
 * against the vertex-colour ramp and the lighting, which previously rendered
 * every block as flat mid-green with no separation between stages.
 */
const CANOPY_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [0.10, 0.17, 0.11],
  [0.17, 0.26, 0.13],
  [0.27, 0.35, 0.15],
  [0.38, 0.42, 0.19],
  [0.47, 0.45, 0.24],
  [0.52, 0.46, 0.31]
];

function interpolateCanopy(t: number): readonly [number, number, number] {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = clamped * (CANOPY_STOPS.length - 1);
  const index = Math.min(CANOPY_STOPS.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const lo = CANOPY_STOPS[index];
  const hi = CANOPY_STOPS[index + 1];
  return [
    lo[0] + (hi[0] - lo[0]) * local,
    lo[1] + (hi[1] - lo[1]) * local,
    lo[2] + (hi[2] - lo[2]) * local
  ];
}

/** xorshift32 so a seed reproduces the same scene on every machine. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * Renders the overlay into a canvas and returns it as an offscreen bitmap.
 * Called once per dataset version; the result is cached by the caller and
 * disposed when the scene unmounts.
 */
export function renderSatelliteOverlay(options: ImageryOptions): HTMLCanvasElement {
  // blockCount is a legacy field; the layout is a fixed cadastral lattice, so
  // it is intentionally unused and destructured only to document that.
  const { size, seed, drainageDepth } = options;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const random = createRandom(seed);

  // Base: uncultivated margin. Lifted off pure black so it does not read as a
  // missing-data hole between blocks.
  const [gr, gg, gb] = GROUND_BASE;
  ctx.fillStyle = `rgb(${Math.round(gr * 255)}, ${Math.round(gg * 255)}, ${Math.round(gb * 255)})`;
  ctx.fillRect(0, 0, size, size);

  // Low-frequency mottling on the margin, so it is not a flat fill either.
  for (let i = 0; i < 260; i += 1) {
    const r = size * (0.01 + random() * 0.05);
    ctx.fillStyle = `rgba(${random() > 0.5 ? '92, 88, 62' : '38, 44, 32'}, ${0.05 + random() * 0.09})`;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Field blocks, laid on a coarse irregular grid rather than scattered at
  // random. Scattering produced large empty gaps that read as missing data;
  // a jittered lattice reads as cadastral subdivision, which is what it is.
  // Cell size chosen so a block spans roughly 90-140 px at 1024. Larger blocks
  // read as abstract colour fields; much smaller and the bunds alias away.
  const cells = 11;
  const cellSize = size / cells;
  const blocks: Array<{ x: number; y: number; w: number; h: number; angle: number }> = [];

  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      // Skip roughly one cell in nine so the lattice is not a perfect grid.
      if (random() < 0.06) continue;
      const w = cellSize * (0.52 + random() * 0.42);
      const h = cellSize * (0.52 + random() * 0.42);
      const x = gx * cellSize + (cellSize - w) / 2 + (random() - 0.5) * cellSize * 0.14;
      const y = gy * cellSize + (cellSize - h) / 2 + (random() - 0.5) * cellSize * 0.14;
      blocks.push({ x, y, w, h, angle: (random() - 0.5) * 0.14 });
    }
  }

  // Split the largest cells so a handful of wide blocks do not dominate.
  const refined: typeof blocks = [];
  for (const block of blocks) {
    if (block.w > cellSize * 0.78 && random() < 0.8) {
      const split = block.w * (0.42 + random() * 0.16);
      refined.push(
        { ...block, w: split },
        { ...block, x: block.x + split + 2, w: block.w - split - 2 }
      );
    } else {
      refined.push(block);
    }
  }

  for (const block of refined) {
    const [r, g, b] = interpolateCanopy(random());
    // Wide shade spread so adjacent blocks separate clearly.
    const shade = 0.78 + random() * 0.44;

    ctx.save();
    ctx.translate(block.x + block.w / 2, block.y + block.h / 2);
    ctx.rotate(block.angle);

    ctx.fillStyle = `rgb(${Math.round(r * shade * 255)}, ${Math.round(g * shade * 255)}, ${Math.round(b * shade * 255)})`;
    ctx.fillRect(-block.w / 2, -block.h / 2, block.w, block.h);

    // Irrigation furrows. Finer spacing than the first pass; the previous
    // 6 px pitch aliased into a flat wash at this texture resolution.
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.08 + random() * 0.07})`;
    ctx.lineWidth = 1;
    const rows = Math.max(4, Math.floor(block.h / 5));
    for (let i = 1; i < rows; i += 1) {
      const yy = -block.h / 2 + (i / rows) * block.h;
      ctx.beginPath();
      ctx.moveTo(-block.w / 2, yy);
      ctx.lineTo(block.w / 2, yy);
      ctx.stroke();
    }

    // Bund: a lit earth edge on the sunward sides, which is what gives a real
    // paddy block its readable outline from above.
    ctx.strokeStyle = BUND_COLOUR;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-block.w / 2, -block.h / 2, block.w, block.h);

    ctx.restore();
  }

  // Drainage network. Drawn as tapering channels that branch, which is what a
  // delta distributary pattern looks like from above.
  ctx.strokeStyle = `rgba(38, 58, 62, ${drainageDepth})`;
  ctx.lineCap = 'round';

  const drawChannel = (x: number, y: number, angle: number, length: number, width: number): void => {
    if (length < 6 || width < 0.6) return;
    const steps = 8;
    let cx = x;
    let cy = y;
    let a = angle;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i < steps; i += 1) {
      a += (random() - 0.5) * 0.42;
      cx += Math.cos(a) * (length / steps);
      cy += Math.sin(a) * (length / steps);
      ctx.lineTo(cx, cy);
    }
    ctx.lineWidth = width;
    ctx.stroke();
    const branches = random() > 0.62 ? 2 : 1;
    for (let b = 0; b < branches; b += 1) {
      drawChannel(cx, cy, a + (random() - 0.5) * 1.5, length * (0.55 + random() * 0.25), width * 0.6);
    }
  };

  // A single dominant channel with branches, drawn last so it cuts across the
  // field blocks the way a real distributary does.
  drawChannel(size * 0.06, size * 0.5, 0.38, size * 0.34, 5.2);
  drawChannel(size * 0.62, size * 0.18, 1.15, size * 0.2, 3.6);

  // Settlement clusters: pale, angular, low-rise. A handful only.
  ctx.fillStyle = 'rgba(184, 176, 160, 0.55)';
  const clusters = 2 + Math.floor(random() * 2);
  for (let c = 0; c < clusters; c += 1) {
    const cx = size * (0.2 + random() * 0.6);
    const cy = size * (0.2 + random() * 0.6);
    const count = 14 + Math.floor(random() * 26);
    for (let b = 0; b < count; b += 1) {
      const bx = cx + (random() - 0.5) * size * 0.05;
      const by = cy + (random() - 0.5) * size * 0.04;
      ctx.fillRect(bx, by, 1.4, 1.4);
    }
  }

  // Fine sensor-like grain. Keeps large uniform areas from banding.
  const grain = ctx.getImageData(0, 0, size, size);
  const data = grain.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (random() - 0.5) * 14;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(grain, 0, 0);

  // Watermark baked into pixels. Single small mark, low contrast: present
  // enough that a screenshot of the canvas alone cannot be mistaken for real
  // data, but small enough that it reads as a provenance stamp rather than a
  // stock-photo watermark.
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${Math.round(size / 46)}px ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('SYNTHETIC', size - size * 0.04, size - size * 0.04);
  ctx.restore();

  return canvas;
}

/**
 * NDVI-style index strip. Real NDVI requires red and NIR reflectance; this is a
 * stylised gradient over the canopy ramp and is labelled as such in the UI.
 */
export function renderIndexOverlay(
  size: number,
  kind: 'ndvi' | 'water' | 'elevation'
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const ramps: Record<string, string[]> = {
    ndvi: ['#4a3722', '#6d6b2a', '#4f7a35', '#2f9448', '#1f6f3a'],
    water: ['#3d4a2a', '#2f5c53', '#2a7f9e', '#1e9bc4', '#7fd4e8'],
    elevation: ['#2b3a2c', '#4a5c38', '#8a7a4e', '#b09a72', '#ded4c4']
  };
  const stops = ramps[kind];

  const gradient = ctx.createLinearGradient(0, size, size, 0);
  stops.forEach((colour, index) => gradient.addColorStop(index / (stops.length - 1), colour));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Blocky structure so the strip reads as an index over fields, not a
  // smooth CSS gradient pasted onto the terrain.
  const random = createRandom(7717);
  for (let i = 0; i < 90; i += 1) {
    ctx.globalAlpha = 0.10 + random() * 0.14;
    ctx.fillStyle = stops[Math.floor(random() * stops.length)];
    const w = size * (0.04 + random() * 0.16);
    const h = size * (0.03 + random() * 0.12);
    ctx.fillRect(random() * (size - w), random() * (size - h), w, h);
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(size / 20)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`DEMO ${kind.toUpperCase()}`, size / 2, size / 2);
  ctx.restore();

  return canvas;
}
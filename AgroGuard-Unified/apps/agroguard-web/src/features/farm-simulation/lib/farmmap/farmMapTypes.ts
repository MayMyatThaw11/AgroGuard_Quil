export type CropId = 'rice' | 'maize' | 'cassava' | 'sugarcane' | 'palm' | 'coffee' | 'veg' | 'fruit' | 'tea';
export type FarmStatus = 'ok' | 'watch' | 'risk';
export type SoilId = 'clay' | 'alluvial' | 'loam' | 'sandy' | 'peat' | 'volcanic' | 'basalt';
export type AnchorFlag = '' | 'flood' | 'drought' | 'hill';
export type MachineKind = 'tractor' | 'harvester' | 'drone' | 'pump';
export type MachineState = 'Working' | 'Idle' | 'En route' | 'Maintenance';
export type LivestockKind = 'buffalo' | 'cattle' | 'duck' | 'poultry' | 'fish' | 'goat';
export type Country = 'Myanmar' | 'Thailand' | 'Vietnam' | 'Cambodia' | 'Laos' | 'Indonesia' | 'Malaysia' | 'Singapore' | 'Philippines' | 'Brunei' | 'Timor-Leste';

export type GlyphName =
  | 'wheat' | 'sprout' | 'trees' | 'coffee' | 'carrot' | 'apple' | 'leaf' | 'store' | 'warehouse' | 'factory' | 'waves'
  | 'radio-tower' | 'tractor' | 'plane' | 'droplets' | 'paw-print' | 'egg' | 'fish' | 'map-pin' | 'flag' | 'truck'
  | 'layers' | 'git-branch' | 'square-dashed' | 'cloud-rain' | 'sun' | 'cloud-sun' | 'cloud-lightning' | 'cloud';

export interface CropMeta {
  label: string;
  color: string;
  icon: GlyphName;
  unit: string;
  yld: readonly [number, number];
}

export interface Anchor {
  id: string;
  country: Country;
  town: string;
  lat: number;
  lon: number;
  crop: CropId;
  soil: SoilId;
  flag: AnchorFlag;
  tz: number;
  farms: Farm[];
}

export interface Farm {
  id: string;
  name: string;
  anchor: string;
  town: string;
  country: Country;
  lat: number;
  lon: number;
  crop: CropId;
  area: number;
  status: FarmStatus;
  ndvi: number;
  organic: boolean;
  bearing: number;
  fieldsN: number;
  soil: SoilId;
  irrigation: string;
  ph: number;
  om: number;
  moisture: number;
  water: number | null;
  yieldF: number;
  flood: number;
  drought: number;
  elev: number;
  stageI: number;
  updMin: number;
  members: number;
  osm?: FarmOutline;
}

export interface FarmOutline {
  id: string;
  landuse: string;
  ring: Position[];
  areaHa: number;
}

interface PoiBase {
  id: string;
  label: string;
  icon: GlyphName;
  lat: number;
  lon: number;
  anchor: string;
  country: Country;
  town: string;
}

export interface MarketPoi extends PoiBase {
  type: 'market';
  hours: string;
  crop: CropId;
}

export interface StoragePoi extends PoiBase {
  type: 'storage';
  capacity: number;
  used: number;
}

export interface MillPoi extends PoiBase {
  type: 'mill';
  capacity: number;
  queue: number;
}

export interface WaterPoi extends PoiBase {
  type: 'water';
  level: number;
}

export interface StationPoi extends PoiBase {
  type: 'station';
}

export interface MachinePoi extends PoiBase {
  type: 'machine';
  kind: MachineKind;
  state: MachineState;
  farm: string;
  battery: number | null;
  fuel: number | null;
}

export interface LivestockPoi extends PoiBase {
  type: 'livestock';
  kind: LivestockKind;
  head: number | null;
  farm: string;
}

export type Poi = MarketPoi | StoragePoi | MillPoi | WaterPoi | StationPoi | MachinePoi | LivestockPoi;
export type PoiType = Poi['type'];

export interface FieldGeometry {
  id: string;
  ring: [number, number][];
  stage: string | null;
  color: string;
  area: number;
  crop: CropId;
}

export interface FarmGeometry {
  fields: FieldGeometry[];
  bound: [number, number][];
}

export interface ChunkBucket {
  farms: Farm[];
  pois: Poi[];
  anchors: Anchor[];
}

export type Position = [number, number];

export interface PointFeature<P> {
  type: 'Feature';
  properties: P;
  geometry: { type: 'Point'; coordinates: Position };
}

export interface LineFeature<P> {
  type: 'Feature';
  properties: P;
  geometry: { type: 'LineString'; coordinates: Position[] };
}

export interface PolygonFeature<P> {
  type: 'Feature';
  id?: number;
  properties: P;
  geometry: { type: 'Polygon'; coordinates: Position[][] };
}

export interface FieldProps {
  id: string;
  farm: string;
  crop: CropId;
  rice: 0 | 1;
  stage: string | null;
  color: string;
  area: number;
  status: FarmStatus;
  organic: 0 | 1;
}

export interface BoundProps {
  farm: string;
  status: FarmStatus;
  crop: CropId;
  organic: 0 | 1;
}

export interface FarmPinProps {
  id: string;
  name: string;
  crop: CropId;
  status: FarmStatus;
  icon: string;
  organic: 0 | 1;
  area: number;
}

export interface PoiProps {
  id: string;
  type: PoiType;
  label: string;
  icon: string;
}

export interface SoilProps {
  soil: SoilId;
  label: string;
  color: string;
}

export interface CanalProps {
  kind: 'main' | 'lateral';
  name?: string;
}

export interface RiskProps {
  flood: number;
  drought: number;
}

export interface RainProps {
  rain: number;
}

export interface ChunkData {
  key: string;
  fields: PolygonFeature<FieldProps>[];
  bounds: PolygonFeature<BoundProps>[];
  farms: PointFeature<FarmPinProps>[];
  pois: PointFeature<PoiProps>[];
  canals: LineFeature<CanalProps>[];
  soil: PolygonFeature<SoilProps>[];
  risk: PointFeature<RiskProps>[];
  wx: PointFeature<RainProps>[];
}

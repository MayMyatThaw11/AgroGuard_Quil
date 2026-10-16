export type FamilyId =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
  | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37;

export type Stack = 'Field crops' | 'Horticulture' | 'Aquaculture' | 'Livestock and bio-enterprises' | 'Integrated circular' | 'Ecological management' | 'Digital layer';

export type FamilyKind = 'production' | 'integration' | 'management' | 'enabling';

export type Coverage = 'CATALOGUED' | 'SOURCED' | 'LOCALLY_APPLICABLE' | 'MODEL_SUPPORTED' | 'FIELD_VALIDATED';

export interface TechniqueFamily {
  id: FamilyId;
  name: string;
  stack: Stack;
  kind: FamilyKind;
  what: string;
  aseanFit: string;
  profile: string;
  leads: readonly string[];
  needsBeyondSite: readonly string[];
  coverage: Coverage;
}

export const CATALOGUE_SOURCE = '37 Farming Technique Families for ASEAN and Global Markets (supplied document), with its FAO and ASEAN references';

const F = (
  id: FamilyId,
  name: string,
  stack: Stack,
  kind: FamilyKind,
  what: string,
  aseanFit: string,
  profile: string,
  leads: readonly string[],
  needsBeyondSite: readonly string[],
): TechniqueFamily => ({ id, name, stack, kind, what, aseanFit, profile, leads, needsBeyondSite, coverage: 'CATALOGUED' });

const BUYER = 'buyer specification';
const CAPITAL = 'capital and working capital';
const POWER = 'reliable power and backup';
const OPERATOR = 'experienced operator';
const WATER_TEST = 'water quality test';
const PERMIT = 'site permit';
const SOIL_TEST = 'soil test';

export const FAMILIES: readonly TechniqueFamily[] = [
  F(1, 'Rainfed farming', 'Field crops', 'production', 'Relies mainly on rainfall', 'Cassava, maize, legumes, upland rice', 'Lower infrastructure cost; weather-sensitive', ['cassava', 'maize', 'legumes', 'upland rice'], [SOIL_TEST]),
  F(2, 'Irrigated farming', 'Field crops', 'production', 'Delivers controlled water', 'Rice, vegetables, fruit', 'Better scheduling; water and energy cost matter', ['rice', 'vegetables', 'fruit'], ['water right or permit', 'pump energy cost']),
  F(3, 'Wetland/paddy farming', 'Field crops', 'production', 'Flooded or saturated rice production', 'Mekong, Chao Phraya, Irrawaddy and other deltas', 'Large food market; margins depend on scale and efficiency', ['rice'], [SOIL_TEST]),
  F(4, 'Dryland farming', 'Field crops', 'production', 'Moisture-conserving practices in water-limited areas', 'Maize, pulses, cassava', 'Climate-resilient when matched to suitable crops', ['maize', 'pulses', 'cassava'], [SOIL_TEST]),
  F(5, 'Plantation/perennial farming', 'Field crops', 'production', 'Long-lived tree or industrial crops', 'Coffee, coconut, rubber, cacao, spices, tropical fruit', 'Export capable; slow establishment and price-cycle exposure', ['coffee', 'coconut', 'rubber', 'cacao', 'spices'], [CAPITAL, BUYER]),
  F(6, 'Mechanized broadacre/monoculture', 'Field crops', 'production', 'Standardizes one major crop over a large area', 'Rice, maize, sugarcane', 'Efficient at scale; concentrated biological and price risk', ['rice', 'maize', 'sugarcane'], ['farm size', 'machinery access']),
  F(7, 'Multiple/succession cropping', 'Field crops', 'production', 'Two or more sequential crops a year', 'Rice–vegetable, maize–legume', 'Raises land-use intensity; needs tight calendars', ['rice then vegetables', 'maize then legume'], ['crop calendar', 'labour peaks']),
  F(8, 'Intercropping and crop rotation', 'Field crops', 'management', 'Combines or alternates complementary crops', 'Maize–legume, coconut understory crops', 'Diversifies revenue; can interrupt pest cycles', ['maize with legume', 'coconut understory'], ['evidence for the specific pair']),
  F(9, 'Open-field vegetables', 'Horticulture', 'production', 'Vegetables grown in the open', 'Chilli, onion, leafy greens, tomato', 'Fast cycles; exposed to rain, pests and price gluts', ['chilli', 'onion', 'leafy greens', 'tomato'], [BUYER]),
  F(10, 'Orchards/pomology', 'Horticulture', 'production', 'Fruit trees', 'Durian, mango, banana, citrus, pineapple', 'High-value potential; multi-year wait and quality requirements', ['durian', 'mango', 'banana', 'citrus', 'pineapple'], [CAPITAL, BUYER]),
  F(11, 'Floriculture and nurseries', 'Horticulture', 'production', 'Cut flowers, ornamentals, grafted seedlings', 'Urban and export corridors', 'High value per area; strict quality and cold-chain needs', ['cut flowers', 'ornamentals', 'grafted seedlings'], [BUYER, 'cold chain']),
  F(12, 'Protected cultivation', 'Horticulture', 'production', 'Greenhouse or net-house growing', 'Peri-urban premium markets', 'More control; medium-to-high capital', ['vegetables', 'berries', 'herbs'], [CAPITAL, BUYER]),
  F(13, 'Hydroponics', 'Horticulture', 'production', 'Soil-less growing in nutrient solution', 'Cities and land-constrained markets', 'Efficient control; nutrient, energy and operator dependence', ['lettuce', 'herbs', 'tomato', 'cucumber'], [POWER, WATER_TEST, OPERATOR, BUYER]),
  F(14, 'Vertical indoor farming', 'Horticulture', 'production', 'Stacked indoor growing under lights', 'Dense premium urban niches', 'Very high control and capex; electricity economics decide', ['leafy greens', 'herbs', 'seedlings'], [POWER, CAPITAL, BUYER]),
  F(15, 'Mushroom/fungiculture', 'Horticulture', 'production', 'Mushrooms on prepared substrate', 'Small-space option', 'Short cycles; hygiene and temperature control are critical', ['oyster', 'shiitake', 'straw mushroom'], ['substrate supply', 'growing room', BUYER]),
  F(16, 'Freshwater pond culture', 'Aquaculture', 'production', 'Fish in earthen ponds', 'Strong rural fit', 'Feed, water quality and survival drive margins', ['tilapia', 'carp', 'catfish'], [WATER_TEST, 'feed supply']),
  F(17, 'Cage and pen culture', 'Aquaculture', 'production', 'Fish in cages or pens in open water', 'Lakes, reservoirs, sheltered coasts', 'Avoids excavation; water-body and regulatory risks', ['tilapia', 'milkfish', 'grouper'], [PERMIT, WATER_TEST]),
  F(18, 'Mariculture', 'Aquaculture', 'production', 'Marine finfish and molluscs', 'Coastal ASEAN', 'Premium species possible; storms, disease and permits matter', ['marine finfish', 'molluscs'], [PERMIT, WATER_TEST]),
  F(19, 'Shrimp/prawn farming', 'Aquaculture', 'production', 'Shrimp in ponds', 'Major export route', 'High value and high biological risk', ['whiteleg shrimp', 'tiger prawn', 'freshwater prawn'], [WATER_TEST, OPERATOR, BUYER, PERMIT]),
  F(20, 'Seaweed and shellfish farming', 'Aquaculture', 'production', 'Seaweed lines and shellfish beds', 'Indonesia, Philippines and suitable coasts', 'Low feed need; site and buyer access decide', ['Kappaphycus', 'Gracilaria', 'oysters', 'mussels'], [PERMIT, BUYER]),
  F(21, 'Recirculating aquaculture systems', 'Aquaculture', 'production', 'Intensive fish or shrimp in tanks with water reuse', 'Urban or land-limited premium markets', 'High biosecurity and control; high capex, energy and technical risk', ['intensive fish', 'shrimp'], [POWER, OPERATOR, CAPITAL]),
  F(22, 'Integrated multi-trophic aquaculture', 'Aquaculture', 'integration', 'Fish or shrimp with shellfish and seaweed', 'Coastal circular systems', 'Turns some waste into extra products', ['fish + shellfish + seaweed'], [PERMIT, OPERATOR]),
  F(23, 'Grazing/rotational grazing', 'Livestock and bio-enterprises', 'production', 'Animals on managed pasture', 'Suitable pasture zones', 'Lower housing intensity; land and forage limits', ['beef', 'goats', 'sheep'], ['pasture area', 'veterinary access']),
  F(24, 'Mixed crop–livestock', 'Livestock and bio-enterprises', 'integration', 'Animals and crops sharing manure and residues', 'Strong smallholder fit', 'Circular nutrients and diversified income', ['meat', 'eggs', 'milk with crops'], ['veterinary access']),
  F(25, 'Intensive poultry/pig systems', 'Livestock and bio-enterprises', 'production', 'Housed high-throughput animals', 'Urban protein demand', 'Feed cost, disease and biosecurity dominate', ['broilers', 'layers', 'pork'], ['biosecurity plan', 'feed supply', PERMIT]),
  F(26, 'Dairy systems', 'Livestock and bio-enterprises', 'production', 'Milk production', 'Cooler highlands and organized milk sheds', 'Daily demand; cold chain and feed quality required', ['milk'], ['cold chain', 'feed supply', 'milk buyer']),
  F(27, 'Apiculture', 'Livestock and bio-enterprises', 'production', 'Bees for honey, wax and pollination', 'Orchards, coffee and agroforestry', 'Land-light; pesticide and forage risks', ['honey', 'wax', 'pollination'], ['neighbour spray schedules']),
  F(28, 'Sericulture', 'Livestock and bio-enterprises', 'production', 'Silkworms on mulberry', 'Selected traditional clusters', 'Niche chain; specialized buyers and skills', ['silk cocoons'], ['specialized buyer', OPERATOR]),
  F(29, 'Agroforestry', 'Integrated circular', 'integration', 'Trees with crops and/or livestock', 'Coffee/cacao shade, fruit–timber, silvopasture', 'Diversified output; long horizon and complex management', ['coffee under shade', 'cacao', 'fruit–timber'], [CAPITAL]),
  F(30, 'Rice–fish farming', 'Integrated circular', 'integration', 'Fish inside or alongside rice fields', 'Excellent rice-region fit', 'Adds protein and revenue; can lower pesticide pressure', ['rice with tilapia or carp'], [WATER_TEST, 'no-spray protection plan']),
  F(31, 'Aquaponics', 'Integrated circular', 'integration', 'Recirculating fish culture with hydroponic vegetables', 'Education and urban premium niches', 'Closed loop; technically sensitive', ['fish with leafy greens'], [POWER, OPERATOR]),
  F(32, 'Integrated crop–livestock–fish', 'Integrated circular', 'integration', 'Ponds, crops, manure, fodder and animals linked', 'Small mixed farms', 'Resource-efficient; food-safety controls essential', ['pond fish with crops and animals'], ['food-safety plan', WATER_TEST]),
  F(33, 'Agrivoltaics', 'Integrated circular', 'integration', 'Crops or livestock with solar generation', 'Hot, sunny sites with suitable regulation', 'Dual land use; financing, grid, shade response and tenure matter', ['shade-tolerant crops under panels'], ['grid connection', 'land tenure', CAPITAL]),
  F(34, 'Organic farming', 'Ecological management', 'management', 'Restricted synthetic inputs with soil and ecosystem management', 'Premium verified markets', 'Possible premium; certification, transition and yield risk', ['any certified crop'], ['certification body', '12–18 month transition (ASOA)']),
  F(35, 'Conservation/regenerative agriculture', 'Ecological management', 'management', 'Minimum disturbance, soil cover, rotation', 'Degraded or erosion-prone land', 'Lower-input resilience; outcomes are site-specific', ['maize', 'rice', 'cover crops'], []),
  F(36, 'Integrated pest management', 'Ecological management', 'management', 'Monitoring plus cultural, biological and selective controls', 'Almost every crop', 'Cuts avoidable spraying; needs scouting discipline', ['any crop'], ['scouting routine']),
  F(37, 'Precision/climate-smart farming', 'Digital layer', 'enabling', 'Sensors, satellite, weather, GIS and decision support', 'Farm service and cooperative tools', 'Can improve input decisions; needs connectivity and agronomic validation', ['any system'], ['connectivity']),
];

export const AGRIQILL_SCOPE: ReadonlySet<FamilyId> = new Set<FamilyId>([1, 2, 3, 4, 5, 6, 7, 8, 16, 19, 24, 30, 31, 32, 33, 34, 35, 36]);

export const FAMILY_BY_ID: Readonly<Record<FamilyId, TechniqueFamily>> = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<FamilyId, TechniqueFamily>;

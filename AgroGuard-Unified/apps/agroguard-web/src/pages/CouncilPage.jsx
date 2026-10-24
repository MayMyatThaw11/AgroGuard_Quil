import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldAlert,
  Sprout,
  Cpu,
  Coins,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Calendar,
  Layers,
  Activity,
  Users,
  Clock,
  Compass,
  FileCheck2,
  RefreshCw,
  Scale,
  Zap,
  Target,
  ShieldCheck,
  Terminal,
  Send,
  Lock,
  Workflow,
  Network,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import axios from 'axios';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { translateNarrative } from '../data/councilNarrativeMy.js';

export default function CouncilPage() {
  const { t, language } = useLanguage();
  const tr = (text) => translateNarrative(text, language);
  const label = (group, code) => {
    const key = `council.${group}.${code}`;
    const value = t(key);
    return value === key ? code : value;
  };
  const [crop, setCrop] = useState('rice');
  const [stage, setStage] = useState('Ripening');
  const [waterDepth, setWaterDepth] = useState(-12.0);
  const [rainForecast, setRainForecast] = useState(15.0);
  const [windSpeed, setWindSpeed] = useState(3.2);
  const [temperature, setTemperature] = useState(31.0);
  const [humidity, setHumidity] = useState(88);
  const [ndviSlope, setNdviSlope] = useState(-0.04);
  const [grainMoisture, setGrainMoisture] = useState(23.0);
  const [daysToHarvest, setDaysToHarvest] = useState(6);

  // Advanced telemetry & ground-truth state vector
  const [activeNodes, setActiveNodes] = useState(4);
  const [affectedNodes, setAffectedNodes] = useState(4);
  const [sensorConfidence, setSensorConfidence] = useState(0.92);
  const [soilMoistureDropRate, setSoilMoistureDropRate] = useState(0.5);
  const [remainingBudget, setRemainingBudget] = useState(50.0);
  const [activeScenario, setActiveScenario] = useState('pre_harvest_rain');

  const [activeTab, setActiveTab] = useState('smart-scope');
  const [activeBridgeTab, setActiveBridgeTab] = useState('field-edge');
  const [agentCardTabs, setAgentCardTabs] = useState({
    alpha: 'diagnosis',
    lou: 'diagnosis',
    qill: 'diagnosis',
  });

  const fieldId = crop === 'rice' ? 'Paddy-01' : crop === 'wheat' ? 'Plot-03' : 'Highland-Lot';
  const [loading, setLoading] = useState(false);
  const [deliberationData, setDeliberationData] = useState(() =>
    getFallbackData(
      {
        crop: 'rice',
        field_id: 'Paddy-01',
        days_to_harvest: 6,
        remaining_budget_usd_per_ha: 50.0,
        affected_nodes: 4,
        active_nodes: 4,
        rh_pct: 88,
        rain_forecast_48h_mm: 15.0,
        soil_moisture_drop_rate_pct_per_hr: 0.5,
      },
      'pre_harvest_rain'
    )
  );

  // 4 Ground-Level Real-World Failure Scenarios
  const scenarios = [
    {
      id: 'pre_harvest_rain',
      title: t('council.sc.rain.title'),
      subtitle: t('council.sc.rain.sub'),
      desc: t('council.sc.rain.desc'),
      apply: () => {
        setActiveScenario('pre_harvest_rain');
        setStage('Ripening');
        setWaterDepth(-12.0);
        setRainForecast(15.0);
        setWindSpeed(3.2);
        setTemperature(31.0);
        setHumidity(88);
        setNdviSlope(-0.04);
        setGrainMoisture(23.0);
        setDaysToHarvest(6);
        setActiveNodes(4);
        setAffectedNodes(4);
        setSensorConfidence(0.92);
        setSoilMoistureDropRate(0.5);
        setRemainingBudget(50.0);
      },
    },
    {
      id: 'clay_sensor_crack',
      title: t('council.sc.clay.title'),
      subtitle: t('council.sc.clay.sub'),
      desc: t('council.sc.clay.desc'),
      apply: () => {
        setActiveScenario('clay_sensor_crack');
        setStage('Tillering');
        setWaterDepth(-18.0);
        setRainForecast(0.0);
        setWindSpeed(3.5);
        setTemperature(33.0);
        setHumidity(60);
        setNdviSlope(-0.01);
        setGrainMoisture(26.0);
        setDaysToHarvest(75);
        setActiveNodes(4);
        setAffectedNodes(1);
        setSensorConfidence(0.45);
        setSoilMoistureDropRate(35.0);
        setRemainingBudget(60.0);
      },
    },
    {
      id: 'monsoon_blight',
      title: t('council.sc.blight.title'),
      subtitle: t('council.sc.blight.sub'),
      desc: t('council.sc.blight.desc'),
      apply: () => {
        setActiveScenario('monsoon_blight');
        setStage('Tillering');
        setWaterDepth(4.0);
        setRainForecast(45.0);
        setWindSpeed(2.4);
        setTemperature(28.5);
        setHumidity(94);
        setNdviSlope(0.01);
        setGrainMoisture(28.0);
        setDaysToHarvest(65);
        setActiveNodes(4);
        setAffectedNodes(3);
        setSensorConfidence(0.91);
        setSoilMoistureDropRate(0.3);
        setRemainingBudget(85.0);
      },
    },
    {
      id: 'fertilizer_spike',
      title: t('council.sc.fert.title'),
      subtitle: t('council.sc.fert.sub'),
      desc: t('council.sc.fert.desc'),
      apply: () => {
        setActiveScenario('fertilizer_spike');
        setStage('Tillering');
        setWaterDepth(2.0);
        setRainForecast(12.0);
        setWindSpeed(2.8);
        setTemperature(30.0);
        setHumidity(78);
        setNdviSlope(-0.03);
        setGrainMoisture(27.0);
        setDaysToHarvest(70);
        setActiveNodes(4);
        setAffectedNodes(4);
        setSensorConfidence(0.88);
        setSoilMoistureDropRate(0.8);
        setRemainingBudget(25.0);
      },
    },
  ];

  const fetchDeliberation = async () => {
    setLoading(true);
    const payload = {
      crop,
      field_id: fieldId,
      stage,
      water_depth_cm: Number(waterDepth),
      rain_forecast_48h_mm: Number(rainForecast),
      wind_speed_ms: Number(windSpeed),
      temperature_c: Number(temperature),
      rh_pct: Number(humidity),
      ndvi_slope: Number(ndviSlope),
      grain_moisture_pct: Number(grainMoisture),
      days_to_harvest: Number(daysToHarvest),
      active_nodes: Number(activeNodes),
      affected_nodes: Number(affectedNodes),
      sensor_confidence_score: Number(sensorConfidence),
      soil_moisture_drop_rate_pct_per_hr: Number(soilMoistureDropRate),
      remaining_budget_usd_per_ha: Number(remainingBudget),
    };

    try {
      const resp = await axios.post('/api/v1/council/deliberate', payload, { timeout: 3000 });
      if (resp.data && typeof resp.data === 'object' && resp.data.initial_assessments) {
        setDeliberationData(resp.data);
      } else {
        setDeliberationData(getFallbackData(payload, activeScenario));
      }
    } catch {
      // Deterministic fallback matching Tri-Bridge Gold Standard
      setDeliberationData(getFallbackData(payload, activeScenario));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliberation();
  }, [crop, stage, activeScenario]);

  function getFallbackData(payload = {}, scenario) {
    const currentScenario = scenario || activeScenario;
    const cropName = payload.crop || crop || 'rice';
    const currentFieldId = payload.field_id || fieldId || 'Paddy-01';
    const grainMoisture = Number(payload.grain_moisture_pct ?? 23.0);
    const waterDepth = Number(payload.water_depth_cm ?? -12.0);
    const ndviSlope = Number(payload.ndvi_slope ?? -0.04);
    const daysToHarvest = Number(payload.days_to_harvest ?? 6);
    const remainingBudget = Number(payload.remaining_budget_usd_per_ha ?? 50.0);
    const soilMoistureDropRate = Number(payload.soil_moisture_drop_rate_pct_per_hr ?? 0.5);
    const affectedNodes = Number(payload.affected_nodes ?? 4);
    const activeNodes = Number(payload.active_nodes ?? 4);
    const rhPct = Number(payload.rh_pct ?? 88);
    const rainForecast = Number(payload.rain_forecast_48h_mm ?? 15.0);

    const isClay = currentScenario === 'clay_sensor_crack' || affectedNodes === 1 || soilMoistureDropRate > 20.0;
    const isBlight = currentScenario === 'monsoon_blight' || (rhPct >= 90 && rainForecast >= 30.0);
    const isFertilizer = currentScenario === 'fertilizer_spike' || remainingBudget <= 30.0;
    const isRain = !isClay && !isBlight && !isFertilizer;

    let triage = 'TYPE_2_LOCALIZED_STRESS';
    let confidence = 0.91;
    const activeVetoes = [];
    const intercepts = [];

    if (isClay) {
      triage = 'TYPE_1_SENSOR_FAULT';
      confidence = 0.94;
      activeVetoes.push({
        agent: 'Lou',
        veto_type: 'HARDWARE_DRIFT_VETO',
        reason: 'Spatial consensus failure (1/4 nodes affected) and impossible 35%/hr drop rate indicate capacitive probe clay shrinkage crack.',
      });
      intercepts.push('[CIRCUIT_BREAKER_INTERCEPT] Forced $0 spend and froze market purchase orders under TYPE_1_SENSOR_FAULT. Suppressed emergency pump activation.');
    } else if (isBlight) {
      triage = 'TYPE_2_LOCALIZED_STRESS';
      confidence = 0.91;
      activeVetoes.push({
        agent: 'Alpha',
        veto_type: 'BIOLOGICAL_VETO',
        reason: 'Opposes blanket chemical fungicide spray under optical satellite blindspot; mandates perimeter cultural canopy aeration and zero-cost bio-control.',
      });
      intercepts.push('[CIRCUIT_BREAKER_INTERCEPT] Suppressed blanket synthetic fungicide under optical satellite blindspot. Routed to cultural canopy aeration.');
    } else if (isFertilizer) {
      triage = 'TYPE_2_LOCALIZED_STRESS';
      confidence = 0.89;
      activeVetoes.push({
        agent: 'Qill',
        veto_type: 'ECONOMIC_VETO',
        reason: 'Solvency violation: Commercial urea price doubled (+45%); blanket NPK fails 3x single-season ROI hurdle and exceeds remaining cash budget ($25/ha).',
      });
      intercepts.push('[CIRCUIT_BREAKER_INTERCEPT] Intercepted commercial urea purchase order exceeding $25/ha budget ceiling. Enforced 3x single-season ROI hurdle.');
    } else {
      triage = 'TYPE_3_SYSTEMIC_CRISIS';
      confidence = 0.93;
      activeVetoes.push({
        agent: 'Alpha',
        veto_type: 'BIOLOGICAL_VETO',
        reason: `Pre-Harvest Interval safety violation: Chemical fungicide requires 21d PHI, but only ${daysToHarvest}d remain until harvest.`,
      });
      intercepts.push('[CIRCUIT_BREAKER_INTERCEPT] Intercepted 21d PHI chemical spray within 6d harvest window. Neutralized to cultural protocol and advanced harvest window.');
    }

    return {
      bridge_transaction_id: isClay ? 'AGY-TX-CLAY-02' : isBlight ? 'AGY-TX-BLIGHT-01' : isFertilizer ? 'AGY-TX-UREA-45' : 'AGY-TX-RAIN-48H',
      triage_classification: triage,
      confidence_score: confidence,
      active_vetoes_triggered: activeVetoes,
      circuit_breaker_intercepts: intercepts,
      tri_bridge_synthesis: {
        field_to_edge_bridge: {
          alpha_visual_check_for_farmer: isClay
            ? 'Inspect Node 2 capacitive probe installation. Tamp drying clay firmly around sensor casing.'
            : isBlight
            ? 'Inspect lower leaf collars for water-soaked lesions at dawn before dew evaporates.'
            : isFertilizer
            ? 'Score 20 leaves with 4-panel Leaf Color Chart (LCC); confirm vegetative split requirement.'
            : 'Verify 85% golden panicle ratio and perform dawn boot-heel firmness test on perimeter bunds.',
          lou_bayesian_recalibration_rule: isClay
            ? 'Apply 4-node spatial median filter; latch probe fault flag; widen reporting interval to 30 min.'
            : isBlight
            ? 'Trigger 15-minute sub-canopy VPD telemetry logging; track microclimate humidity duration.'
            : isFertilizer
            ? 'Adjust Sentinel-2 NDRE red-edge index to detect true nitrogen demand versus water stress.'
            : 'Track Sentinel-2 NDVI senescence regression; adjust rolling median hydrostatic level filter.',
        },
        edge_to_market_bridge: {
          lou_verified_telemetry_proof: isClay
            ? 'Spatial correlation < 0.25 (Nodes 1, 3, 4 normal). Telemetry confirmed hardware drift artifact.'
            : isBlight
            ? 'VPD sustained <0.65 kPa for 14 consecutive hours. Spore propagation microclimate confirmed.'
            : isFertilizer
            ? 'Canopy chlorosis confirmed via NDRE red-edge slope. Spot foliar micro-dose verified sufficient.'
            : 'Sentinel-2 10m NDVI slope (-0.04/10d) validates canopy chlorosis. Soil bearing strength confirmed.',
          qill_buyer_grade_compliance_status: isClay ? 'FREEZE_SPEND_VERIFIED' : isBlight ? 'COMPLIANT_BIO_PROTOCOL' : isFertilizer ? 'BUDGET_PROTECTED' : 'COMPLIANT',
        },
        agronomy_to_commerce_bridge: {
          approved_catalog_sku_id: isClay ? 'NONE_HARDWARE_CHECK_ONLY' : isBlight ? 'TRICHODERMA_BIO_FOLIAR_PACK' : isFertilizer ? 'AZOLLA_BIO_INOCULANT_AND_ZINC_MICRO' : 'NONE_CULTURAL_ONLY',
          unit_cost_usd_ha: isClay ? 0.0 : isBlight ? 12.0 : isFertilizer ? 14.0 : 0.0,
          verified_roi_multiple: isClay ? 99.0 : isBlight ? 4.8 : isFertilizer ? 4.2 : 3.8,
        },
      },
      executable_dispatch_payloads: {
        farmer_action_card_alpha: {
          t_plus_6h_zero_cost_task: isClay
            ? 'Walk to Node 2 coordinate; inspect probe soil contact; pack moist clay firmly around probe ($0 cash).'
            : isBlight
            ? 'Prune dense perimeter foliage to maximize sub-canopy airflow; apply $0 farm-fermented Trichoderma bio-foliar spray at dawn.'
            : isFertilizer
            ? 'Inoculate standing paddy water with cooperative Azolla pinnata green manure ($0 cash) to fix 30 kg N/ha biologically.'
            : 'Open drainage sluice on Paddy-01; verify perimeter bund soil firmness on foot at dawn ($0 cash).',
          exact_field_zone: isClay ? 'Zone-North-Clay (Node 2 coordinate)' : isBlight ? 'High-density canopy borders and shaded depressions' : isFertilizer ? 'Even distribution across standing water table' : 'Low field corners and drainage tailwater weirs',
          tools_needed: isClay ? 'Pocket knife & soil tamper ($0 cash)' : isBlight ? 'Hand pruning shears & knapsack sprayer ($0 cash)' : isFertilizer ? 'Seed basket & bamboo pole ($0 cash)' : 'Hand hoe ($0 cash)',
        },
        iot_downlink_command_lou: {
          target_node_ids: isClay ? ['Node-2'] : ['Node-1', 'Node-2', 'Node-3', 'Node-4'],
          new_wake_interval_sec: isClay ? 1800 : isBlight ? 900 : 3600,
          anomaly_threshold_patch: isClay
            ? 'MEDIAN_FILTER_LEN=4;PROBE_FAULT_LATCH=TRUE'
            : isBlight
            ? 'SUB_CANOPY_VPD_BURST=TRUE;LOG_INTERVAL_SEC=900'
            : isFertilizer
            ? 'CHLOROPHYLL_REGRESSION_MODE=TRUE;SPLIT_DOSE_TRACK=TRUE'
            : 'HARVEST_SENESCENCE_MODE=TRUE;SLEEP_SEC=3600',
        },
        irl_market_intent_qill: {
          action_type: isClay ? 'FREEZE_SPEND' : isBlight ? 'PROCURE_BIO_CONTROL' : isFertilizer ? 'CANCEL_SYNTHETIC_ORDER' : 'LOCK_FORWARD_HARVEST_LOT',
          counterparty_id: isClay ? 'COOP-DIESEL-DEPOT' : isBlight ? 'COOP-BIO-INPUTS' : isFertilizer ? 'AGRI-DEALER-UNION' : 'BUYER-EXP-01',
          protected_margin_usd_ha: isClay ? 422.0 : isBlight ? 188.50 : isFertilizer ? 145.0 : 236.21,
        },
      },
      closed_loop_verification_hook: {
        check_in_hours: isClay ? 24 : isFertilizer ? 72 : 48,
        expected_telemetry_shift: isClay
          ? 'Node 2 soil moisture resets to cluster median (26-28% range) following tamp.'
          : isBlight
          ? 'Sub-canopy VPD rebounds above 0.85 kPa; relative humidity normalizes.'
          : isFertilizer
          ? 'Leaf color chart (LCC) index stabilizes at Stage 4; cash expenditure capped at $14/ha.'
          : 'Water depth stabilizes at -12.0 to -15.0 cm; grain moisture approaches 19.5%.',
        expected_visual_crop_response: isClay
          ? 'Zero leaf rolling or drought stress symptoms confirmed in surrounding 10m radius.'
          : isBlight
          ? 'Zero lesion propagation confirmed on lower flag leaves; canopy aerated.'
          : isFertilizer
          ? 'Deep green vegetative tiller elongation without fertilizer burn.'
          : 'Canopy maintains golden uniform ripening without lodged panicles or vivipary sprouting.',
      },
      initial_assessments: {
        agriculture: {
          stance: isBlight || isRain ? 'CAUTION' : 'APPROVE',
          core_argument: isClay
            ? 'The plants in Zone 2 are standing green and firm. A true biological moisture collapse would cause visible leaf curling by 11 AM. This is drying clay pulling away from the probe casing.'
            : isBlight
            ? 'Monsoon cloud cover blinds optical satellites. Standing humidity invites sheath blight. Clear perimeter furrows to air the lower canopy and apply farm-fermented Trichoderma bio-foliar.'
            : isFertilizer
            ? 'Doubling urea price is an economic trap. Paddy roots at vegetative stage thrive with biological Azolla and micronutrient zinc foliar spray rather than excessive synthetic nitrogen.'
            : `Field drainage is biologically urgent for ${cropName}. At ${grainMoisture.toFixed(1)}% grain moisture, standing water inhibits vascular maturation and creates anaerobic softening.`,
          blind_spot_warning: isClay
            ? 'Failing to perform tactile boot-heel tamp check on Node 2 and misdiagnosing false sensor drift as water stress.'
            : isBlight
            ? 'Applying broad-spectrum chemical fungicides that breach export MRL guidelines during humid stagnant periods.'
            : isFertilizer
            ? 'Over-applying chemical nitrogen which promotes lodging and increases plant susceptibility to insect pests.'
            : 'Failing to verify perimeter bund soil shear strength manually before bringing heavy machinery into field.',
          smart_objective: {
            specific: 'Execute controlled gravity field drainage to prepare soil bearing capacity for harvest.',
            measurable: `Maintain water table at ${waterDepth.toFixed(1)} cm, draw grain moisture toward 19.5%.`,
            achievable: 'Feasible for 1 operator with a hand hoe in 45 minutes of perimeter furrow clearing.',
            relevant: 'Prevents combine bogging and preserves export grade with <5% broken grain.',
            time_bound: 'Clear drainage outlets by 07:00 AM tomorrow; complete final soil firmness check at T-2d.',
          },
          work_definition: {
            project_objective: 'Safeguard root oxygenation, prevent vivipary, and consolidate soil matrix for combine harvester entry.',
            deliverables: [
              'Cleared perimeter drainage sluices and tailwater notches',
              'Dawn soil bearing capacity assessment across low field corners',
              'Panicle straw-ripening ratio verification (target >=85% golden)',
            ],
            success_criteria: [
              'Water depth maintained at -12.0 to -15.0 cm with 0 cm standing surface ponding',
              'Grain moisture desiccates naturally to 18.0%-20.0%',
              'Soil bearing capacity exceeds 300 kPa (boot heel sink < 3 cm)',
            ],
            scope_included: [
              'Hand-tool clearing of field exit ditches',
              'Foot inspection of perimeter bunds at 6 AM',
              'Visual panicle maturity classification',
            ],
            scope_excluded: [
              'Chemical desiccant sprays (strictly forbidden)',
              'Sensor recalibration during wet hours',
              'Heavy wheel equipment entry before soil crusting',
            ],
          },
          build_break_pitch: {
            build_it: 'Walk the perimeter bunds at 6 AM, dig manual finger toe-drains through muddy hollows, and verify panicle maturity by hand-threshing.',
            break_it: '25 mm unforecasted cloudburst ponds in hollows; subsoil liquefies; 5-ton combine bogs down; pre-harvest sprouting (vivipary) destroys seed grade.',
            pitch_it: '45 minutes with a hoe at dawn costs nothing in cash, but saves the family crop from rotting in the mud. No app can dig a furrow.',
          },
        },
        tech: {
          stance: isClay ? 'CAUTION' : 'APPROVE',
          core_argument: isClay
            ? 'Node 2 reported dM/dt = -35.0%/hr. In heavy clay, hydraulic conductivity cannot physically sustain this drainage rate. Furthermore, spatial correlation with adjacent nodes is 0.25. Hardware artifact latch triggered.'
            : isBlight
            ? 'LoRaWAN microclimate probes reveal sub-canopy relative humidity >94% and Tetens VPD <0.65 kPa for 14 hours. 72h lead time ahead of Sentinel-2 optical cloud gap.'
            : isFertilizer
            ? 'Sentinel-2 NDRE red-edge spectral ratio confirms localized nitrogen demand. Sensor-guided split foliar micro-dosing matches canopy intake with zero waste.'
            : `Sentinel-2 10m NDVI slope (${ndviSlope.toFixed(3)}) confirms uniform canopy chlorosis. Sensor drainage rate is 1.8 cm/day.`,
          system_constraint: isClay
            ? 'LoRaWAN node 2 capacitive soil probe reports inconsistent capacitance; spatial median filter engaged.'
            : isBlight
            ? 'Dense canopy humidity attenuates RF signals; adaptive data rate (ADR) shifted to SF8 to guarantee 99.2% delivery.'
            : isFertilizer
            ? 'Telemetry node batteries at 3.4V; sleep interval sustained at 60m while logging split nitrogen uptake.'
            : 'LoRaWAN node battery levels on remote paddies are at 3.4V; sleep interval widened to 60m to preserve operational autonomy.',
          smart_objective: {
            specific: 'Configure edge telemetry node for 60m sleep intervals and enforce irrigation actuator lockout.',
            measurable: 'Packet delivery >= 95%, 0 false pumping pulses, daily power consumption <= 4.72 mAh/day.',
            achievable: 'Delivered via firmware OTA downlink packet across SX1262 LoRaWAN channel.',
            relevant: 'Guarantees sensor node survival through harvest and prevents catastrophic flooding of drying bed.',
            time_bound: 'Firmware parameters applied within next 15-minute scheduled uplink window.',
          },
          work_definition: {
            project_objective: 'Maintain telemetry pipeline integrity, enforce pre-harvest lockout on irrigation/spray actuators, and preserve battery life.',
            deliverables: [
              'LoRaWAN telemetry node battery duty profile (60m sleep cycle)',
              'Rolling median 3-sample hydrostatic filter calibration',
              'Hardware actuator lockout configuration (irrigation/spray forced off)',
            ],
            success_criteria: [
              'Packet reception rate >= 95% across ripening canopy',
              '0 uncommanded actuator firings or false spray approvals',
              'Battery terminal voltage stays above 3.2V throughout harvest',
            ],
            scope_included: [
              'Edge firmware lockouts (wind ceiling 5.5 m/s, PHI pre-harvest window)',
              'Hydrostatic level sensor noise filtering',
              'Satellite Sentinel-2 NDVI senescence trend validation',
            ],
            scope_excluded: [
              'Manual canal sluice lifting (handled by operator)',
              'Continuous HD video streaming on edge nodes',
              'Mechanical combine servicing',
            ],
          },
          build_break_pitch: {
            build_it: 'Solar ESP32-S3 + Semtech SX1262 LoRaWAN nodes (+14 dBm TX, SF8) running ultra-low-power sleep with hydrostatic depth transducers inside perforated stilling wells.',
            break_it: 'Dense ripening crop canopy attenuates 915 MHz RF by 18 dBm, and silt drift corrupts levels by ±3 cm. Firmware must deploy rolling median filtering and hard-lock flight controllers at >5.5 m/s wind.',
            pitch_it: 'We deliver 338 days of dark battery autonomy on LiFePO4, 99.2% packet reliability, and deterministic hardware safety lockouts that make accidental drift or flooding physically impossible.',
          },
        },
        market: {
          stance: isFertilizer ? 'CAUTION' : 'APPROVE',
          core_argument: isClay
            ? 'Suppressing emergency diesel pump activation saves $42.00/ha in unnecessary irrigation fuel. Working capital preserved.'
            : isBlight
            ? 'Cooperative bio-control procurement costs $12/ha vs $85/ha synthetic chemicals. Protecting Grade-A panicle quality preserves $188.50/ha margin.'
            : isFertilizer
            ? 'Commercial urea at $58/bag destroys farm solvency and fails 3x single-season ROI hurdle. Pivot to $14/ha bio-foliar delivers 4.2x ROI multiple.'
            : `Securing a combine harvester booking for day ${daysToHarvest} is the decisive margin lever. Cutting at ${grainMoisture.toFixed(1)}% moisture followed by cooperative drying floor allocation protects 'Pawsan 100%' export grade with under 5% broken rice, capturing a 25% price premium.`,
          unit_economics_impact: isClay
            ? 'Avoids $42/ha futile emergency diesel irrigation pumping.'
            : isBlight
            ? 'Saves $73/ha net input cost by replacing synthetic chemicals with cooperative bio-control.'
            : isFertilizer
            ? 'Saves $44/ha by canceling inflated synthetic urea in favor of biological Azolla.'
            : 'Delayed cutting incurs 12% daily harvest contractor price surge and 15% milling dockage discount.',
          smart_objective: {
            specific: `Execute advance booking for tracked combine harvester and batch drying capacity for Day ${daysToHarvest} harvest.`,
            measurable: 'Capture $1,196.85/ha net margin (+$236.21/ha advantage), hold broken grain < 5.0%.',
            achievable: 'Contract signed with local cooperative machinery pool at standard $85/ha bulk rate.',
            relevant: 'Protects 25% price premium on Pawsan export rice and prevents $156/ha drying surcharges.',
            time_bound: `Contract finalized 48 hours prior to Day ${daysToHarvest} scheduled harvest.`,
          },
          work_definition: {
            project_objective: 'Lock combine harvester contracting, reserve cooperative mechanical dryer slots, and eliminate broken grain dockage.',
            deliverables: [
              `Signed combine harvester contract with guaranteed Day ${daysToHarvest} morning entry SLA`,
              'Cooperative batch drying floor reservation for 14.0% target delivery',
              'Grade 1 "Pawsan 100%" off-take agreement with local export aggregator',
            ],
            success_criteria: [
              'Avoided net revenue loss of $236.21/ha vs panic-cutting at 23% moisture',
              'Milling Head Rice Yield (HRY) >= 60% with brokens <= 5.0%',
              'Total drying surcharge capped at $20.00/MT dry basis',
            ],
            scope_included: [
              'Harvester custom-hire contract execution',
              'Milling off-take grade negotiation',
              'Hardware-as-a-Service ($3/ha/season) precision monitoring fee bundling',
            ],
            scope_excluded: [
              'Unsubsidized upfront $120/ha hardware CAPEX purchases',
              'Off-label chemical desiccation expenses',
              'Spot-market broker distress sales',
            ],
          },
          build_break_pitch: {
            build_it: `Forward-hire rubber-tracked combine harvesters ($85/ha) on Day ${daysToHarvest}, reserve cooperative batch drying slots at $20/MT, and bundle precision sensing at $3/ha/season under a HaaS model.`,
            break_it: 'If the farmer cuts on Day 0 at 23% moisture out of weather panic, raw weight is docked 11.25%, drying surcharges hit $32/MT, green kernels degrade classification to Grade 3 (-$25/MT), and the farmer loses -$236.21/ha net margin!',
            pitch_it: `Standing fast for ${daysToHarvest} days earns our farmers an extra $236 per hectare in cash, protects our Pawsan 100% reputation with under 5% broken grain, and delivers a 78.7-to-1 Benefit-to-Cost Ratio.`,
          },
        },
      },
      cross_examination: [
        {
          from_agent: 'agriculture',
          to_agent: 'tech',
          challenge: 'Your automated sensors cry wolf when heavy clay dries and pulls back from the probe casing.',
          proposed_compromise: 'Lou introduces spatial median consensus (>=3 of 4 nodes) before flagging moisture crises.',
        },
        {
          from_agent: 'tech',
          to_agent: 'market',
          challenge: 'Waiting for ideal buyer grain moisture risks LoRaWAN node battery depletion in dense wet canopy.',
          proposed_compromise: 'Downlink 60-minute sleep intervals to extend node battery life through harvest window.',
        },
        {
          from_agent: 'market',
          to_agent: 'agriculture',
          challenge: 'Zero-cash cultural drainage sounds good, but if rain pools before combine entry, the lot loses Grade-A status.',
          proposed_compromise: 'Mandate dawn boot-heel firmness test; reserve rubber-tracked combine with high flotation tracks.',
        },
      ],
      council_verdict: {
        final_decision: isClay
          ? 'HARDWARE FAULT TRIAGE: Single-node soil crack detected on Node 2. Suppress chemical/irrigation spend ($0 cost). Dispatch 2-minute farmer boot inspection to tamp probe soil.'
          : isBlight
          ? 'CANOPY AERATION & BIO-PROTECTION DIRECTIVE: Lou detects sub-canopy VPD spike (<0.65 kPa) 72h ahead of satellite optical lag. Deploy perimeter canopy pruning and zero-cost Trichoderma bio-foliar protocol.'
          : isFertilizer
          ? 'ORGANIC PIVOT & CASH PRESERVATION DIRECTIVE: Commercial urea inflation fails 3x single-season ROI hurdle. Pivot to zero-cash Azolla green manure inoculation and $14/ha foliar zinc/nitrogen micro-dosing.'
          : 'DRAIN & ADVANCE HARVEST DIRECTIVE: Execute perimeter gravity toe-drainage ($0 cash). Advance harvest window 48h to secure grain moisture before monsoon rainfall and lock $236.21/ha Grade-1 premium.',
        key_tradeoffs_made: [
          'Rejected expensive chemical interventions in favor of zero-cash cultural field management.',
          'Enforced deterministic 21-day Pre-Harvest Interval (PHI) compliance to protect international export trade.',
          'Locked forward combine harvester contract to avoid 12% peak day contractor spot-rate surge.',
        ],
        action_plan: {
          field_execution: isClay
            ? 'Farmer inspects Node 2 soil interface at 6 AM; packs moist clay around capacitive probe.'
            : isBlight
            ? 'Prune dense perimeter foliage to maximize airflow; apply $0 farm-fermented Trichoderma bio-foliar spray at dawn.'
            : isFertilizer
            ? 'Inoculate standing paddy water with cooperative Azolla pinnata green manure ($0 cash) to fix 30 kg N/ha biologically.'
            : 'Clear perimeter drainage tailwater notches with hand hoe; test boot-heel sink depth (<3 cm).',
          technical_implementation: isClay
            ? 'Downlink patch to Node 2: MEDIAN_FILTER_LEN=4, WAKE_INTERVAL=1800s, PROBE_FAULT_LATCH=TRUE.'
            : isBlight
            ? 'Downlink sub-canopy VPD burst logging patch (15m interval) to track spore germination risk window.'
            : isFertilizer
            ? 'Recalibrate edge NDVI chlorophyll regression filter to track split-dose foliar nitrogen uptake.'
            : 'Enforce LoRaWAN 60m sleep interval; hard-lock irrigation valves and aerial spray controllers.',
          commercial_positioning: isClay
            ? 'Freeze emergency diesel pump fuel order; confirm $0 expense; defend working capital.'
            : isBlight
            ? 'Lock cooperative bio-control procurement at $12/ha; avert $85/ha synthetic chemical panic spend.'
            : isFertilizer
            ? 'Cancel blanket synthetic NPK order; route $14/ha micro-dose foliar pack; defend 4.2x ROI multiplier.'
            : 'Execute binding combine harvester reservation at $85/ha; secure cooperative batch dryer slot at $20/MT.',
        },
        project_plan: {
          smart_objective: {
            specific: `Execute controlled harvest preparation for ${cropName} on ${currentFieldId}.`,
            measurable: 'Hold moisture at 19.5%, broken rice <5%, net margin gain +$236.21/ha.',
            achievable: 'Feasible for local farm family using cooperative equipment pool.',
            relevant: 'Protects export Grade 1 off-take agreement and eliminates moisture dockage.',
            time_bound: `Execute harvest strictly on Day ${daysToHarvest} at 10:00 AM.`,
          },
          scope_and_deliverables: {
            project_objective: 'Preserve export grade value, prevent combine bogging, and enforce hardware safety.',
            deliverables: [
              'Cleared perimeter drainage notches',
              'Firmware actuator lockouts configured',
              'Executed harvester reservation SLA',
            ],
            success_criteria: [
              'Pawsan Grade 1 classification (<5% brokens)',
              'Zero uncommanded actuator firings',
              'Net economic gain exceeding +$200/ha',
            ],
            scope_included: [
              'Gravity field drainage via hand tools',
              'LoRaWAN sleep interval downlinks',
              'Cooperative drying slot locking',
            ],
            scope_excluded: [
              'Unregistered agrochemical applications',
              'Motorized pumping during sensor fault',
              'Spot broker distress sales',
            ],
          },
          stakeholders: [
            'Lead Farmer & Household Operators',
            'Agricultural Cooperative Machine Pool',
            'District Agronomy Extension Officer',
            'Licensed Export Commodity Aggregator',
            'AgroGuard Telemetry Field Engineer',
          ],
          raci_matrix: [
            { activity: 'Gravity Field Drainage Furrows', responsible: 'Lead Farmer', accountable: 'Lead Farmer', consulted: 'Alpha (Agronomist)', informed: 'Cooperative' },
            { activity: 'IoT Downlink & Firmware Locking', responsible: 'Lou (IoT Architect)', accountable: 'Lou (IoT Architect)', consulted: 'Lead Farmer', informed: 'Agronomy Extension' },
            { activity: 'Harvester Pool Reservation SLA', responsible: 'Qill (Market Strategist)', accountable: 'Lead Farmer', consulted: 'Cooperative', informed: 'Aggregator' },
            { activity: 'Export Quality Moisture Assay', responsible: 'Aggregator Lab', accountable: 'Lead Farmer', consulted: 'Qill (Market Strategist)', informed: 'Cooperative' },
          ],
          wbs: [
            { id: 'WBS 1.1', what: 'Clear perimeter drainage tailwater sluices', who: 'Lead Farmer', when: 'T+6h (Dawn)', dependency: 'None', milestone: 'Zero surface ponding' },
            { id: 'WBS 1.2', what: 'Transmit LoRaWAN firmware sleep downlink', who: 'Lou', when: 'T+12h', dependency: 'WBS 1.1', milestone: 'Actuator locked' },
            { id: 'WBS 1.3', what: 'Execute combine contract with cooperative', who: 'Qill', when: 'T+24h', dependency: 'None', milestone: 'Signed harvester SLA' },
            { id: 'WBS 1.4', what: 'Boot-heel soil bearing firmness verification', who: 'Alpha', when: 'T-2d 06:00', dependency: 'WBS 1.1', milestone: 'Bearing > 300 kPa' },
          ],
          timeline_and_milestones: [
            'T+0h: Council Deliberation executed; hardware & biological invariants locked.',
            'T+6h: Hand hoe gravity furrows cut on low bunds ($0 cash expenditure).',
            'T+12h: Firmware OTA patch applied; LoRa nodes transition to 60m sleep cycle.',
            'T-2d: Boot-heel soil test confirms combine track mobility without sinking.',
            'T-0d: Harvest executed on hardened ground; zero broken grain dockage.',
          ],
          top_risks: [
            { id: 'R-01', name: 'Clay Soil Shrinkage Sensor False Alarm', category: 'Technical', likelihood: 'Medium', impact: 'Medium', heat_score: 'Medium', mitigation_plan: 'Spatial consensus ratio median filter + 2-min farmer soil tamp check.', owner: 'Lou' },
            { id: 'R-02', name: 'Pre-Harvest Interval (PHI) Chemical MRL Breach', category: 'Agronomic', likelihood: 'Low', impact: 'High', heat_score: 'High', mitigation_plan: 'Deterministic post-LLM circuit breaker vetoes sprays within 21d of harvest.', owner: 'Alpha' },
            { id: 'R-03', name: 'Combine Machine Bogging in Mud Hollows', category: 'Agronomic', likelihood: 'Medium', impact: 'High', heat_score: 'High', mitigation_plan: 'Cut perimeter surface furrows; verify boot-heel sink < 3 cm at dawn.', owner: 'Alpha' },
            { id: 'R-04', name: 'Panic-Cutting Moisture Dockage Discount', category: 'Commercial', likelihood: 'High', impact: 'High', heat_score: 'High', mitigation_plan: 'Hold cutting until 19.5% grain moisture; lock batch dryer reservation.', owner: 'Qill' },
            { id: 'R-05', name: 'High Wind Agrochemical Spray Drift (>5.5 m/s)', category: 'Technical', likelihood: 'Low', impact: 'High', heat_score: 'Medium', mitigation_plan: 'Hard firmware lockout on automated flight controllers and spray valves.', owner: 'Lou' },
          ],
        },
      },
    };
  };

  const assessments = deliberationData?.initial_assessments;
  const verdict = deliberationData?.council_verdict;
  const plan = verdict?.project_plan;
  const triBridge = deliberationData?.tri_bridge_synthesis;
  const dispatches = deliberationData?.executable_dispatch_payloads;
  const activeVetoes = deliberationData?.active_vetoes_triggered || [];
  const circuitBreakerLogs = deliberationData?.circuit_breaker_intercepts || [];
  const triageStatus = deliberationData?.triage_classification || 'TYPE_2_LOCALIZED_STRESS';

  // Deterministic physics metrics (pre-computed)
  const vpdKpa = (
    0.61078 *
    Math.exp((17.27 * temperature) / (temperature + 237.3)) *
    (1.0 - humidity / 100.0)
  ).toFixed(2);
  const dewPointC = (
    (237.7 * ((17.27 * temperature) / (237.7 + temperature) + Math.log(humidity / 100.0))) /
    (17.27 - ((17.27 * temperature) / (237.7 + temperature) + Math.log(humidity / 100.0)))
  ).toFixed(1);
  const spatialRatio = ((affectedNodes / Math.max(1, activeNodes)) * 100).toFixed(0);

  return (
    <div className="council-root min-h-screen bg-[#f8fafc] text-slate-800 pb-16 pt-2 font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
        
        {/* TOP HEADER */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-6 pt-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap text-xs font-semibold tracking-wider text-slate-500 uppercase">
              <span className="text-slate-700">AgroGuard Unified</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700">{t('council.crumb')}</span>
              <span className="rounded-full bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 tracking-wider uppercase">
                BETA
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                Grok / Muse Frontier Engine
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
              {t('council.title')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-3xl leading-relaxed">
              {t('council.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Crop selector pills matching reference design Screen 8 */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-full">
              {[
                { id: 'rice', label: t('council.rice') },
                { id: 'wheat', label: t('council.wheat') },
                { id: 'coffee', label: t('council.coffee') },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCrop(c.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    crop === c.id
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchDeliberation}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs sm:text-sm font-semibold rounded-full shadow-xs transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? t('council.adjudicating') : t('council.run')}</span>
            </button>
          </div>
        </header>

        {/* 4 REAL-WORLD GROUND FAILURE SCENARIOS SELECTOR (Screen 5 & 7 Style) */}
        <section className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>{t('council.scenarios')}</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">{t('council.harness')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {scenarios.map((sc) => {
              const isSelected = activeScenario === sc.id;
              return (
                <button
                  key={sc.id}
                  onClick={sc.apply}
                  className={`text-left p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-emerald-50/40 border-2 border-emerald-600 shadow-xs ring-2 ring-emerald-500/10'
                      : 'bg-white hover:bg-slate-50/60 border-slate-200/80 hover:border-slate-300 hover:shadow-xs group'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-emerald-950' : 'text-slate-900 group-hover:text-emerald-700'}`}>
                        {sc.title}
                      </span>
                      {isSelected ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-300 group-hover:bg-slate-400"></span>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full inline-block font-mono">
                      {sc.subtitle}
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {sc.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* DETERMINISTIC SAFETY AUDIT & ASYMMETRIC VETO GATES (Screen 5 & 9 Dark Card Style) */}
        <section className="bg-slate-950 text-white rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 font-bold">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    {t('council.audit')}
                  </h3>
                  <span className="text-[10px] font-mono font-semibold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    {t('council.nollm')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('council.auditDesc')}
                </p>
              </div>
            </div>

            {/* Triage Classification Badge & Live Indicator */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[10px] uppercase font-mono text-slate-400">{t('council.triageLabel')}</span>
              <span
                className={`px-3.5 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${
                  triageStatus === 'TYPE_1_SENSOR_FAULT'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    : triageStatus === 'TYPE_3_SYSTEMIC_CRISIS'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}
              >
                {label('triage', triageStatus)}
              </span>
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              </div>
            </div>
          </div>

          {/* Active Veto Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Lou Gate */}
            <div className={`p-4 rounded-2xl border space-y-1.5 transition-all ${activeVetoes.some((v) => v.agent === 'Lou' || v.veto_type.includes('HARDWARE')) ? 'bg-rose-950/40 border-rose-800/80 text-rose-200' : 'bg-slate-800/80 border-slate-700/60'}`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-sky-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  {t('council.gateLou')}
                </span>
                <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold ${activeVetoes.some((v) => v.agent === 'Lou' || v.veto_type.includes('HARDWARE')) ? 'bg-rose-500/30 text-rose-200 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                  {activeVetoes.some((v) => v.agent === 'Lou' || v.veto_type.includes('HARDWARE')) ? 'HARDWARE_DRIFT_VETO' : t('council.gateClear')}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {tr(activeVetoes.find((v) => v.agent === 'Lou' || v.veto_type.includes('HARDWARE'))?.reason) || t('council.louOk')}
              </p>
            </div>

            {/* Alpha Gate */}
            <div className={`p-4 rounded-2xl border space-y-1.5 transition-all ${activeVetoes.some((v) => v.agent === 'Alpha' || v.veto_type.includes('BIOLOGICAL')) ? 'bg-amber-950/40 border-amber-800/80 text-amber-200' : 'bg-slate-800/80 border-slate-700/60'}`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-amber-300 flex items-center gap-1.5">
                  <Sprout className="w-3.5 h-3.5" />
                  {t('council.gateAlpha')}
                </span>
                <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold ${activeVetoes.some((v) => v.agent === 'Alpha' || v.veto_type.includes('BIOLOGICAL')) ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                  {activeVetoes.some((v) => v.agent === 'Alpha' || v.veto_type.includes('BIOLOGICAL')) ? 'BIOLOGICAL_VETO' : t('council.gateClear')}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {tr(activeVetoes.find((v) => v.agent === 'Alpha' || v.veto_type.includes('BIOLOGICAL'))?.reason) || t('council.alphaOk')}
              </p>
            </div>

            {/* Qill Gate */}
            <div className={`p-4 rounded-2xl border space-y-1.5 transition-all ${activeVetoes.some((v) => v.agent === 'Qill' || v.veto_type.includes('ECONOMIC')) ? 'bg-purple-950/40 border-purple-800/80 text-purple-200' : 'bg-slate-800/80 border-slate-700/60'}`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-300 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5" />
                  {t('council.gateQill')}
                </span>
                <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold ${activeVetoes.some((v) => v.agent === 'Qill' || v.veto_type.includes('ECONOMIC')) ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                  {activeVetoes.some((v) => v.agent === 'Qill' || v.veto_type.includes('ECONOMIC')) ? 'ECONOMIC_VETO' : t('council.gateClear')}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {tr(activeVetoes.find((v) => v.agent === 'Qill' || v.veto_type.includes('ECONOMIC'))?.reason) || t('council.qillOk')}
              </p>
            </div>
          </div>

          {/* Pure Physics & Math Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs font-mono">
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 uppercase">{t('council.m.vpd')}</span>
              <span className="text-sky-300 font-bold text-sm mt-0.5">{vpdKpa} kPa</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 uppercase">{t('council.m.dew')}</span>
              <span className="text-emerald-300 font-bold text-sm mt-0.5">{dewPointC} °C</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 uppercase">{t('council.m.spatial')}</span>
              <span className={`font-bold text-sm mt-0.5 ${affectedNodes < 2 ? 'text-rose-400' : 'text-slate-200'}`}>
                {spatialRatio}% ({affectedNodes}/{activeNodes})
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 uppercase">{t('council.m.drop')}</span>
              <span className={`font-bold text-sm mt-0.5 ${soilMoistureDropRate > 20 ? 'text-rose-400' : 'text-slate-200'}`}>
                {soilMoistureDropRate}% / hr
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 uppercase">{t('council.m.budget')}</span>
              <span className="text-amber-300 font-bold text-sm mt-0.5">${remainingBudget.toFixed(2)} / ha</span>
            </div>
          </div>

          {/* Circuit Breaker Intercept Logs */}
          {circuitBreakerLogs.length > 0 && (
            <div className="bg-rose-950/40 border border-rose-800/60 p-3.5 rounded-2xl space-y-1">
              <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider block">
                {t('council.breaker')}
              </span>
              {circuitBreakerLogs.map((log, idx) => (
                <div key={idx} className="text-xs text-rose-200 font-mono flex items-start gap-2">
                  <span className="text-rose-400">🛡️</span>
                  <span>{tr(log)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* INTERACTIVE TRI-BRIDGE ARCHITECTURE (Alpha <-> Lou <-> Qill) */}
        <section className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
            <div>
              <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <Network className="w-4 h-4 text-emerald-600" />
                <span>{t('council.bridge.title')}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('council.bridge.sub')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'field-edge', label: t('council.bridge.t1') },
                { id: 'edge-market', label: t('council.bridge.t2') },
                { id: 'agronomy-commerce', label: t('council.bridge.t3') },
              ].map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setActiveBridgeTab(tb.id)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                    activeBridgeTab === tb.id
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bridge Details View */}
          {triBridge && (
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4 md:p-5">
              {activeBridgeTab === 'field-edge' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2.5">
                    <span className="font-bold text-amber-800 flex items-center gap-1.5">
                      <Sprout className="w-4 h-4 text-amber-600" />
                      {t('council.bridge.alphaTactile')}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="font-bold text-sky-800 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-sky-600" />
                      {t('council.bridge.louRecal')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[10px] font-mono text-amber-700 uppercase font-bold">{t('council.bridge.alphaCue')}</span>
                      <p className="text-slate-700 leading-relaxed">{tr(triBridge.field_to_edge_bridge.alpha_visual_check_for_farmer)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[10px] font-mono text-sky-700 uppercase font-bold">{t('council.bridge.louEdge')}</span>
                      <p className="text-slate-700 leading-relaxed">{tr(triBridge.field_to_edge_bridge.lou_bayesian_recalibration_rule)}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeBridgeTab === 'edge-market' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2.5">
                    <span className="font-bold text-sky-800 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-sky-600" />
                      {t('council.bridge.louProof')}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-emerald-600" />
                      {t('council.bridge.qillPassport')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[10px] font-mono text-sky-700 uppercase font-bold">{t('council.bridge.subCanopy')}</span>
                      <p className="text-slate-700 leading-relaxed">{tr(triBridge.edge_to_market_bridge.lou_verified_telemetry_proof)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[10px] font-mono text-emerald-700 uppercase font-bold">{t('council.bridge.compliance')}</span>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono font-bold text-xs">
                          {triBridge.edge_to_market_bridge.qill_buyer_grade_compliance_status}
                        </span>
                        <span className="text-slate-500 text-[11px]">{t('council.bridge.premium')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeBridgeTab === 'agronomy-commerce' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2.5">
                    <span className="font-bold text-amber-800 flex items-center gap-1.5">
                      <Sprout className="w-4 h-4 text-amber-600" />
                      {t('council.bridge.alphaBio')}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-emerald-600" />
                      {t('council.bridge.qillSku')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                      <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">{t('council.bridge.sku')}</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">{triBridge.agronomy_to_commerce_bridge.approved_catalog_sku_id}</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                      <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">{t('council.bridge.unitCost')}</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">${triBridge.agronomy_to_commerce_bridge.unit_cost_usd_ha.toFixed(2)} / ha</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                      <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">{t('council.bridge.roi')}</span>
                      <span className="font-mono font-bold text-amber-700 text-sm">{triBridge.agronomy_to_commerce_bridge.verified_roi_multiple.toFixed(1)}{' '}{t('council.bridge.multiple')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* EXECUTABLE DISPATCH PAYLOADS (Cards for Farmer, Edge Downlink, and Market Intent) */}
        {dispatches && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm md:text-base font-bold text-slate-900 tracking-tight">{t('council.disp.title')}</h2>
              </div>
              <span className="text-xs text-slate-500 font-mono">{t('council.disp.sub')}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Card 1: Farmer Action Card (Alpha) */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-4 shadow-xs hover:border-amber-300 transition-all">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center font-bold shrink-0">
                        <Sprout size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{t('council.disp.farmerCard')}</h3>
                        <span className="text-[10px] text-amber-800 font-medium">{t('council.disp.alphaRole')}</span>
                      </div>
                    </div>
                    <span className="bg-amber-100/80 text-amber-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
                      {t('council.disp.zeroCash')}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.task')}</span>
                      <p className="text-slate-800 font-semibold mt-0.5 leading-snug">{tr(dispatches.farmer_action_card_alpha.t_plus_6h_zero_cost_task)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.zone')}</span>
                      <p className="text-slate-600 font-mono text-[11px] mt-0.5">{tr(dispatches.farmer_action_card_alpha.exact_field_zone)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.tools')}</span>
                      <p className="text-amber-800 font-medium text-[11px] mt-0.5">{tr(dispatches.farmer_action_card_alpha.tools_needed)}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                  <span>{t('council.disp.zeroCapex')}</span>
                  <span className="text-amber-700 font-semibold">{t('council.disp.dawn')}</span>
                </div>
              </div>

              {/* Card 2: IoT Downlink Command (Lou) */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-4 shadow-xs hover:border-sky-300 transition-all">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-bold shrink-0">
                        <Cpu size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{t('council.disp.iotCard')}</h3>
                        <span className="text-[10px] text-sky-800 font-medium">{t('council.disp.louRole')}</span>
                      </div>
                    </div>
                    <span className="bg-sky-100/80 text-sky-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-sky-200">
                      SX1262 LoRaWAN
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.nodes')}</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {dispatches.iot_downlink_command_lou.target_node_ids.map((id, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-mono text-[11px]">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.wake')}</span>
                      <p className="text-slate-800 font-medium text-[11px] mt-0.5">
                        {dispatches.iot_downlink_command_lou.new_wake_interval_sec} {t('council.disp.seconds')}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.patch')}</span>
                      <p className="text-slate-800 font-mono text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-200 mt-0.5 break-all">
                        {dispatches.iot_downlink_command_lou.anomaly_threshold_patch}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                  <span>{t('council.disp.ota')}</span>
                  <span className="text-sky-700 font-semibold">SF8 Channel</span>
                </div>
              </div>

              {/* Card 3: IRL Market Intent (Qill) */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-4 shadow-xs hover:border-emerald-300 transition-all">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                        <Coins size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{t('council.disp.marketCard')}</h3>
                        <span className="text-[10px] text-emerald-800 font-medium">{t('council.disp.qillRole')}</span>
                      </div>
                    </div>
                    <span className="bg-emerald-100/80 text-emerald-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                      {t('council.disp.routed')}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.action')}</span>
                      <p className="text-emerald-700 font-mono font-bold text-sm mt-0.5">
                        {dispatches.irl_market_intent_qill.action_type}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.counterparty')}</span>
                      <p className="text-slate-700 font-mono text-[11px] mt-0.5">
                        {dispatches.irl_market_intent_qill.counterparty_id}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('council.disp.margin')}</span>
                      <p className="text-emerald-700 font-mono font-bold text-sm mt-0.5">
                        +${dispatches.irl_market_intent_qill.protected_margin_usd_ha.toFixed(2)} {t('council.disp.advantage')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                  <span>{t('council.disp.capital')}</span>
                  <span className="text-emerald-700 font-semibold">{t('council.disp.grade1')}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3 DELIBERATIVE COUNCIL AGENT CARDS (Lou, Alpha, Qill) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">1</span>
              <h2 className="text-sm md:text-base font-bold text-slate-900 tracking-tight">{t('council.stage1')}</h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">{t('council.stage1Sub')}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Agent 1: Lou (Tech & IoT Architect) */}
            {assessments?.tech && (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-all">
                <div className="space-y-4">
                  {/* Agent Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-bold shrink-0">
                        <Cpu size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Lou
                        </h3>
                        <span className="text-[11px] font-medium text-sky-700 tracking-wide uppercase">
                          {t('council.louTitle')}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                        assessments.tech.stance === 'APPROVE'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : assessments.tech.stance === 'CAUTION'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {label('stance', assessments.tech.stance)}
                    </span>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex gap-1.5">
                    {['diagnosis', 'build-break', 'smart'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setAgentCardTabs((prev) => ({ ...prev, lou: tab }))}
                        className={`flex-1 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                          agentCardTabs.lou === tab
                            ? 'bg-slate-950 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tab === 'build-break' ? t('council.tab.buildBreak') : tab === 'smart' ? t('council.tab.smart') : t('council.tab.diagnosis')}
                      </button>
                    ))}
                  </div>

                  {/* Tab 1: Diagnosis */}
                  {agentCardTabs.lou === 'diagnosis' && (
                    <div className="space-y-3 text-xs">
                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-slate-700 leading-relaxed">
                        {tr(assessments.tech.core_argument)}
                      </div>
                      <div className="bg-sky-50 border border-sky-100 p-3 rounded-2xl text-[11px] text-sky-900">
                        <strong className="block text-sky-800 font-bold mb-0.5">{t('council.edgeConstraint')}</strong>
                        {tr(assessments.tech.system_constraint)}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Build / Break */}
                  {agentCardTabs.lou === 'build-break' && assessments.tech.build_break_pitch && (
                    <div className="space-y-2 text-xs">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">{t('council.buildIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.tech.build_break_pitch.build_it)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">{t('council.breakIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.tech.build_break_pitch.break_it)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block mb-1">{t('council.pitchIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.tech.build_break_pitch.pitch_it)}</p>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: SMART */}
                  {agentCardTabs.lou === 'smart' && assessments.tech.smart_objective && (
                    <div className="space-y-1.5 text-[11px]">
                      {Object.entries(assessments.tech.smart_objective).map(([k, v]) => (
                        <div key={k} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                          <span className="text-sky-700 font-bold uppercase text-[9px] mr-2">[{k[0].toUpperCase()}]</span>
                          <span className="text-slate-700">{tr(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{t('council.louFoot1')}</span>
                  <span className="text-sky-700 font-medium">{t('council.louFoot2')}</span>
                </div>
              </div>
            )}

            {/* Agent 2: Alpha (Agronomy Master) */}
            {assessments?.agriculture && (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-all">
                <div className="space-y-4">
                  {/* Agent Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center font-bold shrink-0">
                        <Sprout size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Alpha
                        </h3>
                        <span className="text-[11px] font-medium text-amber-700 tracking-wide uppercase">
                          {t('council.alphaTitle')}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                        assessments.agriculture.stance === 'APPROVE'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : assessments.agriculture.stance === 'CAUTION'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {label('stance', assessments.agriculture.stance)}
                    </span>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex gap-1.5">
                    {['diagnosis', 'build-break', 'smart'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setAgentCardTabs((prev) => ({ ...prev, alpha: tab }))}
                        className={`flex-1 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                          agentCardTabs.alpha === tab
                            ? 'bg-slate-950 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tab === 'build-break' ? t('council.tab.buildBreak') : tab === 'smart' ? t('council.tab.smart') : t('council.tab.diagnosis')}
                      </button>
                    ))}
                  </div>

                  {/* Tab 1: Diagnosis */}
                  {agentCardTabs.alpha === 'diagnosis' && (
                    <div className="space-y-3 text-xs">
                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-slate-700 leading-relaxed">
                        {tr(assessments.agriculture.core_argument)}
                      </div>
                      <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-[11px] text-amber-900">
                        <strong className="block text-amber-800 font-bold mb-0.5">{t('council.blindSpot')}</strong>
                        {tr(assessments.agriculture.blind_spot_warning)}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Build / Break */}
                  {agentCardTabs.alpha === 'build-break' && assessments.agriculture.build_break_pitch && (
                    <div className="space-y-2 text-xs">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">{t('council.buildIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.agriculture.build_break_pitch.build_it)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">{t('council.breakIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.agriculture.build_break_pitch.break_it)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block mb-1">{t('council.pitchIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.agriculture.build_break_pitch.pitch_it)}</p>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: SMART */}
                  {agentCardTabs.alpha === 'smart' && assessments.agriculture.smart_objective && (
                    <div className="space-y-1.5 text-[11px]">
                      {Object.entries(assessments.agriculture.smart_objective).map(([k, v]) => (
                        <div key={k} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                          <span className="text-amber-700 font-bold uppercase text-[9px] mr-2">[{k[0].toUpperCase()}]</span>
                          <span className="text-slate-700">{tr(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{t('council.alphaFoot1')}</span>
                  <span className="text-amber-700 font-medium">{t('council.alphaFoot2')}</span>
                </div>
              </div>
            )}

            {/* Agent 3: Qill (Market Strategist) */}
            {assessments?.market && (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-all">
                <div className="space-y-4">
                  {/* Agent Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                        <Coins size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Qill
                        </h3>
                        <span className="text-[11px] font-medium text-emerald-700 tracking-wide uppercase">
                          {t('council.qillTitle')}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                        assessments.market.stance === 'APPROVE'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : assessments.market.stance === 'CAUTION'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {label('stance', assessments.market.stance)}
                    </span>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex gap-1.5">
                    {['diagnosis', 'build-break', 'smart'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setAgentCardTabs((prev) => ({ ...prev, qill: tab }))}
                        className={`flex-1 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                          agentCardTabs.qill === tab
                            ? 'bg-slate-950 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tab === 'build-break' ? t('council.tab.buildBreak') : tab === 'smart' ? t('council.tab.smart') : t('council.tab.diagnosis')}
                      </button>
                    ))}
                  </div>

                  {/* Tab 1: Diagnosis */}
                  {agentCardTabs.qill === 'diagnosis' && (
                    <div className="space-y-3 text-xs">
                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-slate-700 leading-relaxed">
                        {tr(assessments.market.core_argument)}
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-[11px] text-emerald-900">
                        <strong className="block text-emerald-800 font-bold mb-0.5">{t('council.unitEcon')}</strong>
                        {tr(assessments.market.unit_economics_impact)}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Build / Break */}
                  {agentCardTabs.qill === 'build-break' && assessments.market.build_break_pitch && (
                    <div className="space-y-2 text-xs">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">{t('council.buildIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.market.build_break_pitch.build_it)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">{t('council.breakIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.market.build_break_pitch.break_it)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                        <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block mb-1">{t('council.pitchIt')}</span>
                        <p className="text-slate-700 text-[11px] leading-relaxed">{tr(assessments.market.build_break_pitch.pitch_it)}</p>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: SMART */}
                  {agentCardTabs.qill === 'smart' && assessments.market.smart_objective && (
                    <div className="space-y-1.5 text-[11px]">
                      {Object.entries(assessments.market.smart_objective).map(([k, v]) => (
                        <div key={k} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                          <span className="text-emerald-700 font-bold uppercase text-[9px] mr-2">[{k[0].toUpperCase()}]</span>
                          <span className="text-slate-700">{tr(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{t('council.qillFoot1')}</span>
                  <span className="text-emerald-700 font-medium">{t('council.qillFoot2')}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* STAGE 2: CROSS-EXAMINATION FRICTION ROUND */}
        {deliberationData?.cross_examination && deliberationData.cross_examination.length > 0 && (
          <section className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold">2</span>
                <h2 className="text-sm md:text-base font-bold text-slate-900 tracking-tight">{t('council.stage2')}</h2>
              </div>
              <span className="text-xs text-slate-500 font-mono">{t('council.stage2Sub')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {deliberationData.cross_examination.map((item, idx) => (
                <div key={idx} className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className={item.from_agent === 'agriculture' ? 'text-amber-800' : item.from_agent === 'tech' ? 'text-sky-800' : 'text-emerald-800'}>
                      {item.from_agent === 'agriculture' ? 'ALPHA' : item.from_agent === 'tech' ? 'LOU' : 'QILL'}
                    </span>
                    <span className="text-slate-400 text-[11px]">{t('council.challenges')}</span>
                    <span className={item.to_agent === 'agriculture' ? 'text-amber-800' : item.to_agent === 'tech' ? 'text-sky-800' : 'text-emerald-800'}>
                      {item.to_agent === 'agriculture' ? 'ALPHA' : item.to_agent === 'tech' ? 'LOU' : 'QILL'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed"><strong className="text-slate-800">{t('council.pushback')}</strong> {tr(item.challenge)}</p>
                  <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <strong className="text-emerald-700">{t('council.compromise')}</strong> {tr(item.proposed_compromise)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* STAGE 3: EXECUTIVE SYNTHESIS & AMCHAM 8-POINT MASTER PLAN */}
        {verdict && (
          <section className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
            {/* Directive Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">3</span>
                <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">{t('council.stage3')}</h2>
              </div>
              <span className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full font-semibold">
                {t('council.adjudicated')}
              </span>
            </div>

            {/* Directive Box */}
            <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-2xl p-5 space-y-3.5">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">{t('council.directive')}</span>
              <p className="text-sm sm:text-base font-semibold text-emerald-950 leading-relaxed">{tr(verdict.final_decision)}</p>

              {/* Trade-offs list */}
              <div className="pt-3 border-t border-emerald-200/80 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('council.tradeoffs')}</span>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-700">
                  {verdict.key_tradeoffs_made.map((tradeoff, idx) => (
                    <li key={idx} className="bg-white p-3 rounded-xl border border-emerald-200/70 flex items-start gap-2 shadow-2xs">
                      <span className="text-emerald-600 font-bold">•</span>
                      <span>{tr(tradeoff)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 3-Pillar Action Plan */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="bg-slate-50 border border-slate-200/70 p-4 rounded-2xl space-y-1.5">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sprout size={14} className="text-amber-600 shrink-0" />
                  {t('council.pillar.alpha')}
                </span>
                <p className="text-xs text-slate-700 leading-relaxed">{tr(verdict.action_plan.field_execution)}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/70 p-4 rounded-2xl space-y-1.5">
                <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu size={14} className="text-sky-600 shrink-0" />
                  {t('council.pillar.lou')}
                </span>
                <p className="text-xs text-slate-700 leading-relaxed">{tr(verdict.action_plan.technical_implementation)}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/70 p-4 rounded-2xl space-y-1.5">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Coins size={14} className="text-emerald-600 shrink-0" />
                  {t('council.pillar.qill')}
                </span>
                <p className="text-xs text-slate-700 leading-relaxed">{tr(verdict.action_plan.commercial_positioning)}</p>
              </div>
            </div>

            {/* AMCHAM 8-Point Project Plan Framework Tabs */}
            {plan && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-emerald-600" />
                      <span>{t('council.amcham.title')}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{t('council.amcham.sub')}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'smart-scope', label: t('council.amcham.t1') },
                      { id: 'raci-stakeholders', label: t('council.amcham.t2') },
                      { id: 'wbs-timeline', label: t('council.amcham.t3') },
                      { id: 'risk-mitigation', label: t('council.amcham.t4') },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                          activeTab === tab.id
                            ? 'bg-slate-950 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TAB 1: 01 SMART & 02 Scope */}
                {activeTab === 'smart-scope' && (
                  <div className="space-y-5">
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2.5">{t('council.p01')}</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                        {Object.entries(plan.smart_objective).map(([k, v]) => (
                          <div key={k} className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl">
                            <span className="text-[10px] font-mono font-bold text-emerald-700 block mb-1">
                              {t(`council.smart.${['specific', 'measurable', 'achievable', 'relevant'].includes(k) ? k : 'time_bound'}`)}
                            </span>
                            <span className="text-slate-700 leading-relaxed">{tr(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2.5">{t('council.p02')}</span>
                      <div className="bg-slate-50 border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3.5 text-xs">
                        <div className="text-slate-800"><strong className="text-slate-900">{t('council.objectiveWhy')}</strong> {tr(plan.scope_and_deliverables.project_objective)}</div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <span className="text-[11px] font-bold text-emerald-800 block mb-1">{t('council.deliverables')}</span>
                            <ul className="list-disc list-inside text-slate-600 space-y-1">
                              {plan.scope_and_deliverables.deliverables.map((d, i) => <li key={i}>{tr(d)}</li>)}
                            </ul>
                          </div>

                          <div>
                            <span className="text-[11px] font-bold text-amber-800 block mb-1">{t('council.success')}</span>
                            <ul className="list-disc list-inside text-slate-600 space-y-1">
                              {plan.scope_and_deliverables.success_criteria.map((c, i) => <li key={i}>{tr(c)}</li>)}
                            </ul>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200/70">
                          <div>
                            <span className="text-[11px] font-bold text-sky-800 block mb-1">{t('council.scopeIn')}</span>
                            <ul className="list-disc list-inside text-slate-500 text-[11px] space-y-0.5">
                              {plan.scope_and_deliverables.scope_included.map((inc, i) => <li key={i}>{tr(inc)}</li>)}
                            </ul>
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-rose-800 block mb-1">{t('council.scopeOut')}</span>
                            <ul className="list-disc list-inside text-slate-500 text-[11px] space-y-0.5">
                              {plan.scope_and_deliverables.scope_excluded.map((exc, i) => <li key={i}>{tr(exc)}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: 03 Stakeholders & 04 RACI */}
                {activeTab === 'raci-stakeholders' && (
                  <div className="space-y-5">
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2.5">{t('council.p03')}</span>
                      <div className="flex flex-wrap gap-2">
                        {plan.stakeholders.map((s, idx) => (
                          <span key={idx} className="bg-slate-50 border border-slate-200 text-slate-700 text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-medium">
                            <Users className="w-3.5 h-3.5 text-emerald-600" />
                            {tr(s)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">{t('council.p04')}</span>
                      <p className="text-[11px] text-slate-400 mb-3">
                        <strong className="text-purple-700">R</strong> {t('council.raci.R')} · <strong className="text-rose-700">A</strong> {t('council.raci.A')} · <strong className="text-emerald-700">C</strong> {t('council.raci.C')} · <strong className="text-sky-700">I</strong> {t('council.raci.I')}
                      </p>
                      <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.activity')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.R')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.A')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.C')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.I')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {plan.raci_matrix.map((row, i) => (
                              <tr key={i} className="hover:bg-slate-50/50">
                                <td className="py-3 px-3.5 font-medium text-slate-800">{tr(row.activity)}</td>
                                <td className="py-3 px-3.5 text-purple-800 font-mono text-[11px]"><span className="bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded mr-1">R</span> {tr(row.responsible)}</td>
                                <td className="py-3 px-3.5 text-rose-800 font-mono text-[11px]"><span className="bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded mr-1">A</span> {tr(row.accountable)}</td>
                                <td className="py-3 px-3.5 text-emerald-800 font-mono text-[11px]"><span className="bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded mr-1">C</span> {tr(row.consulted)}</td>
                                <td className="py-3 px-3.5 text-sky-800 font-mono text-[11px]"><span className="bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded mr-1">I</span> {tr(row.informed)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: 05 WBS & 06 Timeline */}
                {activeTab === 'wbs-timeline' && (
                  <div className="space-y-5">
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">{t('council.p05')}</span>
                      <p className="text-[11px] text-slate-400 mb-3">{t('council.p05sub')}</p>
                      <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                              <th className="py-2.5 px-3.5 font-semibold">WBS</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.what')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.who')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.when')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.dependency')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.milestone')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {plan.wbs.map((w, i) => (
                              <tr key={i} className="hover:bg-slate-50/50">
                                <td className="py-3 px-3.5 font-mono font-bold text-emerald-700">{w.id}</td>
                                <td className="py-3 px-3.5 text-slate-800 font-medium">{tr(w.what)}</td>
                                <td className="py-3 px-3.5 text-slate-600">{tr(w.who)}</td>
                                <td className="py-3 px-3.5 text-slate-500 font-mono text-[11px]">{tr(w.when)}</td>
                                <td className="py-3 px-3.5 text-slate-500 text-[11px]">{tr(w.dependency)}</td>
                                <td className="py-3 px-3.5 text-emerald-800 font-medium text-[11px]">{tr(w.milestone)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2.5">{t('council.p06')}</span>
                      <div className="space-y-2">
                        {plan.timeline_and_milestones.map((milestone, idx) => (
                          <div key={idx} className="bg-slate-50 border-l-3 border-emerald-500 p-3 rounded-r-xl text-xs text-slate-700 flex items-center gap-2.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{tr(milestone)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: 07 3x3 Risk Heat Map & 08 Mitigation */}
                {activeTab === 'risk-mitigation' && (
                  <div className="space-y-5">
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">{t('council.p07')}</span>
                      <p className="text-[11px] text-slate-400 mb-3">{t('council.p07sub')}</p>

                      {/* Visual 3x3 Matrix Grid */}
                      <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                        <div className="grid grid-cols-4 gap-2.5 text-center text-xs">
                          {/* Header row */}
                          <div className="text-slate-400 font-mono text-[10px] self-end pb-1">{t('council.hm.corner')}</div>
                          <div className="text-slate-600 font-bold text-[11px] pb-1">{t('council.hm.lowImpact')}</div>
                          <div className="text-slate-600 font-bold text-[11px] pb-1">{t('council.hm.medImpact')}</div>
                          <div className="text-slate-600 font-bold text-[11px] pb-1">{t('council.hm.highImpact')}</div>

                          {/* Row 1: High Likelihood */}
                          <div className="text-slate-600 font-bold text-[11px] flex items-center justify-end pr-2">{t('council.hm.highLike')}</div>
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-amber-700 font-bold">{label('level', 'Medium')}</span>
                          </div>
                          <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-rose-700 font-bold">{label('level', 'High')}</span>
                          </div>
                          <div className="bg-rose-100 border border-rose-300 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-rose-800 font-bold">{label('level', 'High')}</span>
                            <span className="bg-rose-200 text-rose-900 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">{t('council.hm.r04')}</span>
                          </div>

                          {/* Row 2: Medium Likelihood */}
                          <div className="text-slate-600 font-bold text-[11px] flex items-center justify-end pr-2">{t('council.hm.medLike')}</div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-emerald-700 font-bold">{label('level', 'Low')}</span>
                          </div>
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-amber-700 font-bold">{label('level', 'Medium')}</span>
                            <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">{t('council.hm.r01')}</span>
                          </div>
                          <div className="bg-rose-100 border border-rose-300 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-rose-800 font-bold">{label('level', 'High')}</span>
                            <span className="bg-rose-200 text-rose-900 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">{t('council.hm.r03')}</span>
                          </div>

                          {/* Row 3: Low Likelihood */}
                          <div className="text-slate-600 font-bold text-[11px] flex items-center justify-end pr-2">{t('council.hm.lowLike')}</div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-emerald-700 font-bold">{label('level', 'Low')}</span>
                          </div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-emerald-700 font-bold">{label('level', 'Low')}</span>
                          </div>
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 min-h-16 flex flex-col justify-between">
                            <span className="text-[10px] text-amber-700 font-bold">{label('level', 'Medium')}</span>
                            <div className="space-y-1">
                              <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-mono block font-medium">{t('council.hm.r02')}</span>
                              <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-mono block font-medium">{t('council.hm.r05')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2.5">{t('council.p08')}</span>
                      <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.id')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.risk')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.likelihood')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.impact')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.heat')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.mitigation')}</th>
                              <th className="py-2.5 px-3.5 font-semibold">{t('council.th.owner')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {plan.top_risks.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50/50">
                                <td className="py-3 px-3.5 font-mono font-bold text-emerald-700">{r.id}</td>
                                <td className="py-3 px-3.5 font-medium text-slate-800">{tr(r.name)}</td>
                                <td className="py-3 px-3.5 text-slate-500">{label('level', r.likelihood)}</td>
                                <td className="py-3 px-3.5 text-slate-500">{label('level', r.impact)}</td>
                                <td className="py-3 px-3.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                      r.heat_score === 'High'
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : r.heat_score === 'Medium'
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    }`}
                                  >
                                    {label('level', r.heat_score)}
                                  </span>
                                </td>
                                <td className="py-3 px-3.5 text-emerald-800 font-medium">{tr(r.mitigation_plan)}</td>
                                <td className="py-3 px-3.5 text-slate-500 font-mono text-[11px]">{r.owner}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

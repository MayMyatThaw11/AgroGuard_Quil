import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Satellite, Leaf, TrendingUp, Info, Droplets, ThermometerSun } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { API_BASE_URL } from '../api';
import NdviRegionMap from './NdviRegionMap.jsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const DEFAULT_CENTER = [20.0, 96.0];

// Soil pH is not here on purpose: it does not change month to month, so it cannot move with
// NDVI. The two factors left are real monthly weather from NASA POWER.
const correlationFactors = [
  { key: 'rainfall_mm', labelKey: 'ndvi.correlationRainfall', icon: Droplets },
  { key: 'temperature_c', labelKey: 'ndvi.correlationTemperature', icon: ThermometerSun },
];

function correlationDescription(value, t) {
  if (value === null || value === undefined) return t('ndvi.correlationUnavailable');
  const absolute = Math.abs(value);
  const strength = absolute >= 0.7 ? 'Strong' : absolute >= 0.4 ? 'Moderate' : absolute >= 0.2 ? 'Weak' : 'VeryWeak';
  const direction = value > 0.02 ? 'Positive' : value < -0.02 ? 'Negative' : 'Neutral';
  return `${t(`ndvi.correlation${strength}`)} · ${t(`ndvi.correlation${direction}`)}`;
}

export default function NDVIAnalysis() {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  // Chart.js draws on a canvas, so it cannot read CSS variables: pick its text colours here.
  const inkStrong = theme === 'dark' ? '#d9e8dd' : '#3a423d';
  const inkSoft = theme === 'dark' ? '#a9c4b1' : '#535d57';
  const gridLine = theme === 'dark' ? 'rgba(169,196,177,0.18)' : 'rgba(154,163,157,0.18)';
  const [regions, setRegions] = useState([]);
  const [boundaries, setBoundaries] = useState(null);
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedPcode, setSelectedPcode] = useState('');
  const [markerPosition, setMarkerPosition] = useState(DEFAULT_CENTER);
  const [ndviData, setNdviData] = useState({ labels: [], vim: [], viq: [] });
  const [correlationData, setCorrelationData] = useState(null);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [correlationError, setCorrelationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const loadRegions = async () => {
      try {
        setError('');
        const response = await axios.get(`${API_BASE_URL}/analytics/ndvi-regions`, { signal: controller.signal });
        const available = response.data || [];
        setRegions(available);
        const firstState = available.find((region) => region.level === 'state')?.PCODE || available[0]?.PCODE || '';
        setSelectedState((current) => current || firstState);
        setSelectedPcode((current) => current || firstState);
        const first = available.find((region) => region.PCODE === firstState);
        if (first && Number.isFinite(first.latitude)) setMarkerPosition([first.latitude, first.longitude]);
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          setError(t('ndvi.regionsError'));
          setLoading(false);
        }
      }
      // The outlines are a nicety: without them the dropdowns still work.
      try {
        const response = await axios.get(`${API_BASE_URL}/analytics/ndvi-boundaries`, { signal: controller.signal });
        setBoundaries(response.data || null);
      } catch {
        setBoundaries(null);
      }
    };
    loadRegions();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const states = regions.filter((region) => region.level === 'state');
  const districts = regions
    .filter((region) => region.level === 'district' && region.state_pcode === selectedState)
    .sort((a, b) => a.PCODE.localeCompare(b.PCODE));

  const regionName = (region) => (language === 'my' ? region.name_my : region.name_en) || region.PCODE;
  const selectedRegion = regions.find((region) => region.PCODE === selectedPcode);
  const centreOf = (region) => (region && Number.isFinite(region.latitude) ? [region.latitude, region.longitude] : DEFAULT_CENTER);

  const chooseRegion = (pcode, position) => {
    const region = regions.find((item) => item.PCODE === pcode);
    if (!region) return;
    const isDistrict = region.level === 'district';
    setSelectedState(isDistrict ? region.state_pcode : pcode);
    setSelectedDistrict(isDistrict ? pcode : '');
    setSelectedPcode(pcode);
    setMarkerPosition(position || centreOf(region));
  };

  const handleStateChange = (event) => chooseRegion(event.target.value);
  const handleDistrictChange = (event) => chooseRegion(event.target.value || selectedState);

  useEffect(() => {
    if (!selectedPcode) return undefined;
    const controller = new AbortController();
    const loadNdvi = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await axios.get(`${API_BASE_URL}/ndvi/${encodeURIComponent(selectedPcode)}`, { signal: controller.signal });
        setNdviData(response.data);
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          setError(t('ndvi.measurementsError'));
          setNdviData({ labels: [], vim: [], viq: [] });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadNdvi();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPcode]);

  useEffect(() => {
    if (!selectedPcode) return undefined;
    const controller = new AbortController();
    const loadCorrelations = async () => {
      try {
        setCorrelationLoading(true);
        setCorrelationError('');
        const response = await axios.get(`${API_BASE_URL}/analytics/ndvi-environment-correlation`, {
          params: { pcode: selectedPcode },
          signal: controller.signal,
        });
        setCorrelationData(response.data);
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          setCorrelationData(null);
          setCorrelationError(t('ndvi.correlationError'));
        }
      } finally {
        if (!controller.signal.aborted) setCorrelationLoading(false);
      }
    };
    loadCorrelations();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPcode]);

  const chartData = {
    labels: ndviData?.labels || [],
    datasets: [
      {
        label: t('ndvi.latestVim'),
        data: ndviData?.vim || [],
        borderColor: '#17aa51',
        backgroundColor: 'rgba(23, 170, 81, 0.2)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y'
      },
      {
        label: t('ndvi.latestViq'),
        data: ndviData?.viq || [],
        borderColor: '#d77a11',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.4,
        yAxisID: 'y1'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: inkStrong, font: { size: 13, weight: '600' }, padding: 18, usePointStyle: true } }
    },
    scales: {
      x: { ticks: { color: inkSoft }, grid: { color: gridLine } },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: t('ndvi.latestVim'), color: '#17aa51' },
        ticks: { color: inkSoft },
        grid: { color: gridLine }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: t('ndvi.latestViq'), color: '#d77a11' },
        grid: { drawOnChartArea: false },
        ticks: { color: inkSoft }
      },
    },
  };

  return (
    <div className={`ndvi-analysis ${language === 'my' ? 'language-my' : ''}`}>
      <h2 className="ndvi-page-title"><Satellite size={28} aria-hidden="true" /> <span>{t('ndvi.title')}</span></h2>
      <p className="ndvi-page-subtitle">{t('ndvi.subtitle')}</p>

      <div className="glass-panel ndvi-explainer">
        <h3><Info size={18} aria-hidden="true" /> {t('ndvi.whatIsNdvi')}</h3>
        <ul>
          <li><strong>{t('ndvi.vimDesc')}</strong></li>
          <li><strong>{t('ndvi.viqDesc')}</strong></li>
        </ul>
      </div>

      <div className="ndvi-controls glass-panel">
        <div className="ndvi-controls-heading">
          <div className="ndvi-controls-kicker">{t('ndvi.location')}</div>
          <h3>{t('ndvi.selectRegion')}</h3>
        </div>
        <div className="ndvi-control-field">
          <label htmlFor="ndvi-state">{t('ndvi.stateRegion')}</label>
          <select id="ndvi-state" value={selectedState} onChange={handleStateChange} disabled={regions.length === 0}>
            {states.map((state) => (
              <option key={state.PCODE} value={state.PCODE}>{regionName(state)}</option>
            ))}
          </select>
        </div>
        <div className="ndvi-control-field">
          <label htmlFor="ndvi-district">{t('ndvi.districtDetail')}</label>
          <select id="ndvi-district" value={selectedDistrict} onChange={handleDistrictChange}>
            <option value="">{t('ndvi.allDistricts')}</option>
            {districts.map((district) => (
              <option key={district.PCODE} value={district.PCODE}>{regionName(district)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-panel ndvi-map-panel">
        <div className="ndvi-map-heading">
          <div>
            <div className="ndvi-controls-kicker">{t('ndvi.mapTitle')}</div>
            <p>{t('ndvi.mapHint')}</p>
          </div>
          <strong>{selectedRegion ? regionName(selectedRegion) : t('ndvi.mapMyanmar')}</strong>
        </div>
        <NdviRegionMap
          boundaries={boundaries}
          selected={selectedDistrict || selectedState}
          position={markerPosition}
          language={language}
          label={t('ndvi.mapTitle')}
          onSelect={(props, position) => chooseRegion(props.PCODE, position)}
        />
      </div>

      {error && <p className="crop-suggestion-error" role="alert">{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{t('ndvi.loadingData')}</p>}

      <div className="grid grid-cols-3" style={{ gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-panel">
          <h3><Leaf size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }} aria-hidden="true" /> {t('ndvi.latestVim')}</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
            {ndviData?.vim?.length ? ndviData.vim[ndviData.vim.length - 1].toFixed(3) : '-'}
          </div>
        </div>
        <div className="glass-panel">
          <h3>{t('ndvi.avgVim')}</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>
            {ndviData?.vim?.length ? (ndviData.vim.reduce((a, b) => a + b, 0) / ndviData.vim.length).toFixed(3) : '-'}
          </div>
        </div>
        <div className="glass-panel">
          <h3><TrendingUp size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }} aria-hidden="true" /> {t('ndvi.latestViq')}</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
            {ndviData?.viq?.length ? ndviData.viq[ndviData.viq.length - 1].toFixed(1) : '-'}
          </div>
        </div>
      </div>

      <section className="glass-panel ndvi-correlation-panel" aria-labelledby="ndvi-correlation-title">
        <div className="ndvi-correlation-heading">
          <div>
            <div className="ndvi-controls-kicker">{t('ndvi.correlationKicker')}</div>
            <h3 id="ndvi-correlation-title">{t('ndvi.correlationTitle')}</h3>
            <p>{t('ndvi.correlationSubtitle')}</p>
          </div>
          {correlationData && <span className="ndvi-correlation-scope">{t('ndvi.correlationPoint')}</span>}
        </div>

        {correlationLoading && <p className="ndvi-correlation-status">{t('ndvi.correlationLoading')}</p>}
        {correlationError && <p className="crop-suggestion-error" role="alert">{correlationError}</p>}
        {correlationData && !correlationLoading && (
          <>
            <div className="ndvi-correlation-grid">
              {correlationFactors.map(({ key, labelKey, icon: FactorIcon }) => {
                const value = correlationData.correlations?.[key];
                const barStyle = value >= 0
                  ? { left: '50%', width: `${Math.abs(value || 0) * 50}%` }
                  : { right: '50%', width: `${Math.abs(value || 0) * 50}%` };
                return (
                  <article className="ndvi-correlation-card" key={key}>
                    <div className="ndvi-correlation-card-title"><FactorIcon size={19} aria-hidden="true" /><span>{t(labelKey)}</span></div>
                    <strong>{value === null || value === undefined ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(3)}`}</strong>
                    <div className="ndvi-correlation-meter" aria-hidden="true"><i /><span className={value >= 0 ? 'positive' : 'negative'} style={barStyle} /></div>
                    <p>{correlationDescription(value, t)}</p>
                  </article>
                );
              })}
            </div>
            <p className="ndvi-correlation-note">
              {t('ndvi.correlationBasedOn')} {correlationData.sample_count} {t('ndvi.correlationMonths')} ({correlationData.period_start}–{correlationData.period_end}). {t('ndvi.correlationSeasons')} {t('ndvi.correlationCaveat')}
            </p>
          </>
        )}
      </section>

      <div className="glass-panel" style={{ height: '400px' }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

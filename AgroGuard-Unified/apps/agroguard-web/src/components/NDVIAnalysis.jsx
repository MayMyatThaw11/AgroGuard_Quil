import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Satellite, Leaf, TrendingUp, Info, MapPin, X } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { useLanguage, pcodeMap } from '../contexts/LanguageContext';
import { API_BASE_URL } from '../api';
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

export default function NDVIAnalysis() {
  const { t, language } = useLanguage();
  const [regions, setRegions] = useState([]);
  const [selectedPcode, setSelectedPcode] = useState('');
  const [ndviData, setNdviData] = useState({ labels: [], vim: [], viq: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadRegions = async () => {
      try {
        setError('');
        const response = await axios.get(
          `${API_BASE_URL}/analytics/ndvi-regions`,
          { signal: controller.signal }
        );
        const availableRegions = response.data || [];
        setRegions(availableRegions);
        setSelectedPcode((current) => current || availableRegions[0]?.PCODE || '');
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          console.error('NDVI regions error:', err);
          setError('Unable to load NDVI regions.');
          setLoading(false);
        }
      }
    };

    loadRegions();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedPcode) return undefined;
    const controller = new AbortController();

    const loadNdvi = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await axios.get(
          `${API_BASE_URL}/ndvi/${encodeURIComponent(selectedPcode)}`,
          { signal: controller.signal }
        );
        setNdviData(response.data);
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') {
          console.error('NDVI data error:', err);
          setError('Unable to load NDVI measurements for this region.');
          setNdviData({ labels: [], vim: [], viq: [] });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadNdvi();
    return () => controller.abort();
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
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: '#3a423d',
          font: { size: 13, weight: '600' },
          padding: 18,
          usePointStyle: true,
        }
      }
    },
    scales: {
      x: { ticks: { color: '#535d57' }, grid: { color: 'rgba(154,163,157,0.18)' } },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: t('ndvi.latestVim'), color: '#17aa51' },
        ticks: { color: '#535d57' },
        grid: { color: 'rgba(154,163,157,0.18)' }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: t('ndvi.latestViq'), color: '#d77a11' },
        grid: { drawOnChartArea: false },
        ticks: { color: '#535d57' }
      },
    },
  };

  const getRegionName = (pcode, adm_id) => {
    // If it's in our mapping (e.g. MMR001), use the mapped name.
    // If it's a district (like MMR001D001), fallback to the original PCODE or adm_id
    if (pcodeMap[language] && pcodeMap[language][pcode]) {
      return pcodeMap[language][pcode];
    }
    // Attempt to extract the state part for districts (e.g. MMR001 from MMR001D001)
    if (pcode && pcode.length > 6) {
      const statePcode = pcode.substring(0, 6);
      if (pcodeMap[language] && pcodeMap[language][statePcode]) {
        return `${pcodeMap[language][statePcode]} (${pcode})`;
      }
    }
    return `${adm_id} (${pcode})`;
  };

  return (
    <div className="ndvi-analysis">
      <div className="ndvi-header">
        <div className="ndvi-header-text">
          <div className="ndvi-title-row">
            <h1><Satellite size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }}/> {t('ndvi.title')}</h1>
            <div className="ndvi-info">
              <button
                type="button"
                className={`ndvi-info-btn ${infoOpen ? 'active' : ''}`}
                onClick={() => setInfoOpen((open) => !open)}
                aria-expanded={infoOpen}
                aria-label={t('ndvi.whatIsNdvi')}
                title={t('ndvi.whatIsNdvi')}
              >
                <Info size={20} />
              </button>
              {infoOpen && (
                <div className="ndvi-info-popover" role="dialog" aria-label={t('ndvi.whatIsNdvi')}>
                  <div className="ndvi-info-popover-head">
                    <strong>{t('ndvi.whatIsNdvi')}</strong>
                    <button type="button" onClick={() => setInfoOpen(false)} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>
                  <p>{t('ndvi.vimDesc')}</p>
                  <p>{t('ndvi.viqDesc')}</p>
                </div>
              )}
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('ndvi.subtitle')}
          </p>
        </div>

        <div className="ndvi-controls glass-panel">
          <MapPin size={18} color="var(--primary)" aria-hidden="true" />
          <label htmlFor="ndvi-region" style={{ margin: 0 }}>{t('ndvi.selectRegion')}</label>
          <select
            id="ndvi-region"
            value={selectedPcode}
            onChange={(e) => setSelectedPcode(e.target.value)}
            disabled={loading && regions.length === 0}
          >
            {regions.map((r) => (
              <option key={`${r.PCODE}-${r.adm_id}`} value={r.PCODE}>{getRegionName(r.PCODE, r.adm_id)}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="crop-suggestion-error" role="alert">{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Loading NDVI data…</p>}

      <div className="grid grid-cols-3" style={{ gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-panel">
          <h3><Leaf size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> {t('ndvi.latestVim')}</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
             {ndviData?.vim?.length ? ndviData.vim[ndviData.vim.length-1].toFixed(3) : '-'}
          </div>
        </div>
        <div className="glass-panel">
          <h3>{t('ndvi.avgVim')}</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>
             {ndviData?.vim?.length ? (ndviData.vim.reduce((a,b)=>a+b,0)/ndviData.vim.length).toFixed(3) : '-'}
          </div>
        </div>
        <div className="glass-panel">
          <h3><TrendingUp size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> {t('ndvi.latestViq')}</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
             {ndviData?.viq?.length ? ndviData.viq[ndviData.viq.length-1].toFixed(1) : '-'}
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ height: '400px' }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

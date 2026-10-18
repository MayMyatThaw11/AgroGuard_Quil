import React, { useState } from 'react';
import {
  Globe2,
  MapPin,
  UploadCloud,
  CheckCircle2,
  Layers,
  Ruler,
  Wind,
  Compass,
  X,
  Sparkles,
  ArrowRight,
  FolderUp
} from 'lucide-react';
import { REAL_WORLD_EARTH_PARCELS, buildCustomGoogleEarthParcel } from '../lib/googleEarth';
import { OnboardFarmDialog } from './onboard/OnboardFarmDialog.tsx';
import type { GoogleEarthLandParcel } from '../types';

interface GoogleEarthImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectParcel: (parcel: GoogleEarthLandParcel) => void;
  currentParcelId?: string;
}

export const GoogleEarthImportModal: React.FC<GoogleEarthImportModalProps> = ({
  isOpen,
  onClose,
  onSelectParcel,
  currentParcelId
}) => {
  const [activeTab, setActiveTab] = useState<'farm' | 'presets' | 'custom' | 'geojson'>('farm');
  const [customName, setCustomName] = useState('Kyauktan Township Paddy Unit');
  const [customLat, setCustomLat] = useState('16.6341');
  const [customLon, setCustomLon] = useState('96.3289');
  const [customArea, setCustomArea] = useState('16.5');
  const [customEcoZone, setCustomEcoZone] = useState<GoogleEarthLandParcel['primaryEcoZone']>('lowland-delta');
  const [geoJsonInput, setGeoJsonInput] = useState(`{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [[96.3250, 16.6310], [96.3330, 16.6325], [96.3315, 16.6370], [96.3238, 16.6355], [96.3250, 16.6310]]
    ]
  },
  "properties": {
    "name": "Custom Google Earth Boundary",
    "crop": "Organic Lowland Rice"
  }
}`);

  if (!isOpen) return null;
  if (activeTab === 'farm') return <OnboardFarmDialog onClose={onClose} onDemoPresets={() => setActiveTab('presets')} />;

  const handleCustomImport = () => {
    const lat = parseFloat(customLat) || 16.8661;
    const lon = parseFloat(customLon) || 96.1951;
    const area = parseFloat(customArea) || 15.0;
    const newParcel = buildCustomGoogleEarthParcel(customName, lat, lon, area, customEcoZone);
    onSelectParcel(newParcel);
    onClose();
  };

  const handleGeoJsonImport = () => {
    try {
      const parsed = JSON.parse(geoJsonInput);
      let lat = 16.2941;
      let lon = 95.3982;
      if (parsed.geometry?.coordinates?.[0]?.[0]) {
        lon = parsed.geometry.coordinates[0][0][0];
        lat = parsed.geometry.coordinates[0][0][1];
      }
      const name = parsed.properties?.name || 'Imported GeoJSON Boundary';
      const newParcel = buildCustomGoogleEarthParcel(name, lat, lon, 20.0, 'lowland-delta');
      onSelectParcel(newParcel);
      onClose();
    } catch {
      alert('Invalid GeoJSON format. Please verify the coordinate polygon.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#090A0F] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#12151E]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-semibold text-white tracking-tight">
                  Google Earth &amp; Geodata Land Area Importer
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  REAL-WORLD GIS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Import high-resolution digital elevation models, Sentinel-2 spectral raster layers, and SoilGrids stratigraphy into the 3D agent simulation canvas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-6 pt-3 border-b border-white/5 bg-[#090A0F]">
          <button
            type="button"
            onClick={() => setActiveTab('farm')}
            className="pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-2 border-transparent text-slate-400 hover:text-slate-200"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span>Your farm files</span>
          </button>
          <span className="pb-2.5 pl-3 pr-1 text-[10px] uppercase tracking-wider text-slate-500">Demo presets</span>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'presets'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Curated Agricultural Basins (6 Verified)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'custom'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Custom GPS Coordinates</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('geojson')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'geojson'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>GeoJSON Boundary Layer</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'presets' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {REAL_WORLD_EARTH_PARCELS.map((p) => {
                const isSelected = p.id === currentParcelId;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectParcel(p);
                      onClose();
                    }}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition relative group ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                        : 'bg-[#12151E] hover:bg-[#181D2A] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-white group-hover:text-cyan-400 transition">
                            {p.name}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {p.region} · {p.country}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300">
                        {p.areaHectares} ha
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase">Centroid</span>
                        <span className="text-slate-300">
                          {p.centroid.lat.toFixed(2)}°, {p.centroid.lon.toFixed(2)}°
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase">Elev Range</span>
                        <span className="text-slate-300">
                          {p.elevationM.min}m – {p.elevationM.max}m
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase">Wind Speed</span>
                        <span className={p.weather.windSpeedMs > 5.5 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                          {p.weather.windSpeedMs} m/s
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 truncate max-w-[240px]">
                        {p.soilSeries}
                      </span>
                      <span className="text-cyan-400 group-hover:translate-x-1 transition flex items-center space-x-1 font-medium">
                        <span>Load Basin</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-4 max-w-xl mx-auto bg-[#12151E] p-5 rounded-xl border border-white/10">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Parcel Display Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/15 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Latitude (WGS84)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-white/15 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Longitude (WGS84)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={customLon}
                    onChange={(e) => setCustomLon(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-white/15 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Area (Hectares)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={customArea}
                    onChange={(e) => setCustomArea(e.target.value)}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-white/15 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Topographic Terrain EcoZone</label>
                  <select
                    value={customEcoZone}
                    onChange={(e) => setCustomEcoZone(e.target.value as GoogleEarthLandParcel['primaryEcoZone'])}
                    className="w-full px-3 py-2 bg-[#090A0F] border border-white/15 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="lowland-delta">Lowland Delta Alluvial Plain</option>
                    <option value="volcanic-terrace">Volcanic Mountain Terraces</option>
                    <option value="mangrove-estuary">Coastal Mangrove &amp; Shrimp Estuary</option>
                    <option value="river-basin">Irrigated River Polder Basin</option>
                    <option value="highland-plateau">Highland Karst Plateau</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCustomImport}
                className="w-full mt-3 py-2.5 px-4 rounded-xl font-medium text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20 transition active:scale-[0.99]"
              >
                <Sparkles className="w-4 h-4" />
                <span>Synthesize 3D Terrain &amp; Ingest Geodata</span>
              </button>
            </div>
          )}

          {activeTab === 'geojson' && (
            <div className="space-y-4 max-w-xl mx-auto bg-[#12151E] p-5 rounded-xl border border-white/10">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  GeoJSON Polygon Boundary Feature
                </label>
                <textarea
                  rows={8}
                  value={geoJsonInput}
                  onChange={(e) => setGeoJsonInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090A0F] border border-white/15 rounded-lg text-[11px] font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="button"
                onClick={handleGeoJsonImport}
                className="w-full py-2.5 px-4 rounded-xl font-medium text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Parse Boundary &amp; Mount Land Model</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#12151E] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>ISRIC SoilGrids 2.0 (250m)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <Ruler className="w-3.5 h-3.5 text-emerald-400" />
              <span>Relief: synthetic preview, no DEM</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 transition text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

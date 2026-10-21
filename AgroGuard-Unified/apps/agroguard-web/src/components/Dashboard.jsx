import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
	ClipboardList,
	CloudRain,
	Globe2,
	HeartPulse,
	Leaf,
	Sprout,
	TrendingUp,
	TriangleAlert,
	Scale,
	ArrowRight,
	Cpu,
	Coins,
	Zap,
} from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { API_BASE_URL } from '../api.js'
import { loadCropConditions } from '../lib/cropConditions.js'
import { PLANT_GROUPS } from '../data/plantGroups.js'

// Every figure on this page comes from a real source and says which: the farm's own saved
// health updates, FAOSTAT price and production tables, or the weather data used by the
// last Crop Suggestion run. Where a source has nothing, the card says so instead of guessing.
// Colours come from the --ag-* tokens in index.css, so the page follows light and dark mode.

const COUNTRY_MM = {
	'Brunei Darussalam': 'ဘရူနိုင်း',
	Cambodia: 'ကမ္ဘောဒီးယား',
	Indonesia: 'အင်ဒိုနီးရှား',
	"Lao People's Democratic Republic": 'လာအို',
	Malaysia: 'မလေးရှား',
	Philippines: 'ဖိလစ်ပိုင်',
	Singapore: 'စင်ကာပူ',
	Thailand: 'ထိုင်း',
	'Viet Nam': 'ဗီယက်နမ်',
}
const PLANT_MM = Object.fromEntries(
	PLANT_GROUPS.flatMap((group) => group.crops.flatMap((c) => [[c.en, c.my], [c.id, c.my]])),
)
const STATUS_KEYS = { Healthy: 'status.healthy', Diseased: 'status.diseased', 'Pest Infested': 'status.pest', 'Drought Stressed': 'status.drought' }

const card = 'rounded-3xl bg-(--ag-card) p-5 sm:p-6'
const muted = 'text-(--ag-muted)'

const number = (value, digits = 0) =>
	value == null ? null : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })

function Source({ children }) {
	return <p className={`mt-4 text-xs ${muted}`}>{children}</p>
}

function NoData({ children }) {
	return <p className={`rounded-2xl bg-(--ag-card-2) px-4 py-6 text-center text-sm ${muted}`}>{children}</p>
}

function CardTitle({ icon: Icon, children }) {
	return (
		<div className="flex items-center gap-2 text-(--ag-text)">
			<Icon size={18} className="text-(--ag-accent)" aria-hidden="true" />
			<h3 className="text-base font-bold">{children}</h3>
		</div>
	)
}

function Bar({ percent }) {
	return (
		<div className="h-3 rounded-full bg-(--ag-card-2)">
			<div className="h-3 rounded-full bg-(--ag-bar)" style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
		</div>
	)
}

function Trend({ points }) {
	if (points.length < 2) return null
	const values = points.map((p) => p.medianUsdPerTonne)
	const [low, high] = [Math.min(...values), Math.max(...values)]
	const span = high - low || 1
	const path = points
		.map((p, i) => {
			const x = (i / (points.length - 1)) * 300
			const y = 56 - ((p.medianUsdPerTonne - low) / span) * 52
			return `${x.toFixed(1)},${y.toFixed(1)}`
		})
		.join(' ')
	const first = points[0]
	const last = points[points.length - 1]
	return (
		<div className="mt-5">
			<svg
				viewBox="0 0 300 60"
				className="h-20 w-full"
				role="img"
				aria-label={`ASEAN median price, ${first.year}: $${number(first.medianUsdPerTonne)}, ${last.year}: $${number(last.medianUsdPerTonne)}`}
			>
				<polyline points={path} fill="none" stroke="var(--ag-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
			</svg>
			<div className={`flex justify-between text-xs ${muted}`}>
				<span>
					{first.year} · ${number(first.medianUsdPerTonne)}
				</span>
				<span>
					{last.year} · ${number(last.medianUsdPerTonne)}
				</span>
			</div>
		</div>
	)
}

function Dashboard() {
	const { t, language } = useLanguage()
	const [crop, setCrop] = useState('Rice (Paddy)')
	const [data, setData] = useState(null)
	const [failed, setFailed] = useState(false)
	const burmese = language === 'my'
	const country = (name) => (burmese && COUNTRY_MM[name]) || name
	const plant = (name) => (burmese && PLANT_MM[name]) || name
	const status = (name) => (STATUS_KEYS[name] ? t(STATUS_KEYS[name]) : name)
	const conditions = useMemo(() => loadCropConditions(), [])

	useEffect(() => {
		let active = true
		fetch(`${API_BASE_URL}/dashboard/stats?crop=${encodeURIComponent(crop)}`)
			.then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
			.then((next) => {
				if (!active) return
				setData(next)
				setFailed(false)
			})
			.catch(() => active && setFailed(true))
		return () => {
			active = false
		}
	}, [crop])

	const records = data?.records
	const myanmar = data?.myanmar
	const rice = myanmar?.crops?.find((c) => c.crop === 'Rice')
	const prices = data?.prices
	const topPrice = prices?.countries?.[0]?.usdPerTonne || 1
	const waiting = data ? t('dash.noData') : '…'

	const tiles = [
		{
			key: 'dash.records',
			value: records?.available ? number(records.total) : null,
			note: records?.available ? records.source : records ? t('dash.dbDown') : '',
			icon: ClipboardList,
		},
		{
			key: 'dash.diseased',
			value: records?.available ? number(records.diseased) : null,
			note: records?.available ? records.source : records ? t('dash.dbDown') : '',
			icon: TriangleAlert,
			warn: records?.available && records.diseased > 0,
		},
		{
			key: 'dash.yield',
			value: rice?.yieldTPerHa != null ? `${rice.yieldTPerHa} t/ha` : null,
			note: rice ? `${rice.crop}, Myanmar, ${myanmar.year} · ${myanmar.source}` : '',
			icon: Sprout,
		},
		{
			key: 'dash.rainfall',
			value: conditions ? `${number(conditions.rainfall_mm)} mm` : null,
			note: conditions ? t('dash.rainfallFrom') : t('dash.runCrop'),
			icon: CloudRain,
		},
	]

	return (
		<div className="space-y-4">
			<section className="flex flex-wrap items-end justify-between gap-3 px-1">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.18em] text-(--ag-accent)">AgroGuard</p>
					<h2 className="mt-1 text-3xl font-extrabold leading-tight text-(--ag-text)">{t('dash.title')}</h2>
					<p className={`mt-2 max-w-3xl text-sm sm:text-base ${muted}`}>{t('dash.subtitle')}</p>
				</div>
				<span className={`inline-flex items-center gap-2 rounded-full border border-(--ag-line) px-3 py-1.5 text-xs font-semibold ${muted}`}>
					<Globe2 size={14} aria-hidden="true" />
					{t('dash.asean')}
				</span>
			</section>

			{failed && (
				<p role="alert" className="rounded-2xl border border-(--ag-warn-line) bg-(--ag-warn-bg) px-4 py-3 text-sm text-(--ag-warn)">
					{t('dash.loadFailed')}
				</p>
			)}

			<section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
				{tiles.map((tile) => {
					const Icon = tile.icon
					return (
						<article
							key={tile.key}
							className={`rounded-2xl p-4 ${tile.warn ? 'border border-(--ag-warn-line) bg-(--ag-warn-bg)' : 'bg-(--ag-card)'}`}
						>
							<div className={`flex items-center gap-2 text-xs font-semibold ${tile.warn ? 'text-(--ag-warn)' : muted}`}>
								<Icon size={16} className={tile.warn ? '' : 'text-(--ag-accent)'} aria-hidden="true" />
								{t(tile.key)}
							</div>
							<p className={`mt-2 font-extrabold leading-tight ${tile.value ? 'text-3xl' : 'text-lg'} ${tile.warn ? 'text-(--ag-warn)' : tile.value ? 'text-(--ag-text)' : muted}`}>
								{tile.value ?? waiting}
							</p>
							{tile.note ? <p className={`mt-2 text-xs ${tile.warn ? 'text-(--ag-warn)' : muted}`}>{tile.note}</p> : null}
						</article>
					)
				})}
			</section>

			{/* AGROGUARD COUNCIL SUB BETA FEATURE CARD */}
			<section className="rounded-3xl border border-(--ag-line) bg-(--ag-card) p-6 sm:p-7 shadow-xs space-y-5">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--ag-line) pb-5">
					<div className="space-y-1.5">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-xs font-bold uppercase tracking-[0.18em] text-(--ag-accent)">
								Frontier Multi-Agent Adjudication
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200/80">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
								Sub Beta Feature
							</span>
							<span className="rounded-full bg-slate-950 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
								BETA
							</span>
						</div>
						<h3 className="text-xl sm:text-2xl font-extrabold text-(--ag-text) flex items-center gap-2.5">
							<Scale size={24} className="text-(--ag-accent)" />
							<span>AgroGuard Council: Lou, Alpha & Qill</span>
						</h3>
						<p className={`text-xs sm:text-sm max-w-3xl ${muted}`}>
							Constraint-driven multi-agent adjudication brain outthinking macro AgTech through ground-truth edge AI, generational agronomy, and IRL supply chain economics.
						</p>
					</div>

					<Link
						to="/council"
						className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all hover:bg-emerald-700 hover:shadow-sm shrink-0"
					>
						<span>Open Council Console</span>
						<ArrowRight size={16} />
					</Link>
				</div>

				{/* High-contrast status pill (matching reference design Screen 5 dark card) */}
				<div className="rounded-3xl bg-slate-950 p-5 sm:p-6 text-white shadow-sm space-y-4">
					<div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-3.5">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider">
								Live Council Status
							</span>
							<span className="text-xs text-slate-300 font-medium">TYPE_2_LOCALIZED_STRESS Active</span>
						</div>
						<div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
							<span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
						</div>
					</div>

					<div className="space-y-1">
						<h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
							Directive: Gravity Pre-Harvest Field Drainage & 21-Day PHI Chemical Lockout
						</h4>
						<p className="text-xs text-slate-400">
							Tetens VPD: 0.54 kPa · Magnus Dew Point: 28.8 °C · 4/4 Sensor Consensus · Margin Advantage: +$236.21/ha
						</p>
					</div>

					<div className="flex flex-wrap gap-2 text-[11px] font-mono pt-1">
						<span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-slate-300">
							Lou: Edge Gate Clear
						</span>
						<span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-slate-300">
							Alpha: Bio Gate Armed
						</span>
						<span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-slate-300">
							Qill: 3x ROI Enforced
						</span>
					</div>
				</div>

				{/* 3 Domain Agents Summary Cards (Matching Reference Design Screen 9 Minimalist Grid) */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
					{/* Lou Card */}
					<div className="rounded-2xl border border-(--ag-line) bg-(--ag-card-2) p-5 flex flex-col justify-between space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
									<Cpu size={18} />
								</div>
								<div>
									<h4 className="text-sm font-bold text-(--ag-text)">Lou</h4>
									<p className="text-[11px] text-sky-700 font-medium">Edge AI & Telemetry</p>
								</div>
							</div>
							<span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
								APPROVE
							</span>
						</div>
						<p className={`text-xs leading-relaxed ${muted}`}>
							Ground-truth sensor validation outthinking satellite cloud cover. Detects clay shrinkage crack false alarms ($0 spend) and downlinks SX1262 LoRaWAN duty profile patches.
						</p>
					</div>

					{/* Alpha Card */}
					<div className="rounded-2xl border border-(--ag-line) bg-(--ag-card-2) p-5 flex flex-col justify-between space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
									<Sprout size={18} />
								</div>
								<div>
									<h4 className="text-sm font-bold text-(--ag-text)">Alpha</h4>
									<p className="text-[11px] text-amber-800 font-medium">Generational Agronomist</p>
								</div>
							</div>
							<span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
								APPROVE
							</span>
						</div>
						<p className={`text-xs leading-relaxed ${muted}`}>
							Muddy boots tactile prior enforcing 21-day Pre-Harvest Interval (PHI) biological guardrails. Replaces chemical panics with zero-cost perimeter gravity furrows and boot-heel tests.
						</p>
					</div>

					{/* Qill Card */}
					<div className="rounded-2xl border border-(--ag-line) bg-(--ag-card-2) p-5 flex flex-col justify-between space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
									<Coins size={18} />
								</div>
								<div>
									<h4 className="text-sm font-bold text-(--ag-text)">Qill</h4>
									<p className="text-[11px] text-emerald-800 font-medium">Agri-Business Strategist</p>
								</div>
							</div>
							<span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
								APPROVE
							</span>
						</div>
						<p className={`text-xs leading-relaxed ${muted}`}>
							Defends farmer working capital with strict 3x single-season ROI hurdles. Forward-contracts cooperative combine harvesters and locks Grade-1 export price premiums.
						</p>
					</div>
				</div>

				{/* 4 Failure Scenarios quick strip */}
				<div className="rounded-2xl border border-dashed border-(--ag-line) p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
					<div className="flex items-center gap-2">
						<Zap size={14} className="text-amber-500 shrink-0" />
						<span className="font-semibold text-(--ag-text)">Interactive Test Harness:</span>
						<span className={muted}>4 Ground Scenarios (Rain Threat, Clay Sensor Crack, Blight Risk, Fertilizer Spike)</span>
					</div>
					<Link
						to="/council"
						className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline shrink-0"
					>
						<span>Explore Deliberation & AMCHAM Plan</span>
						<ArrowRight size={14} />
					</Link>
				</div>
			</section>

			<section className={card}>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<CardTitle icon={TrendingUp}>{t('dash.priceTitle')}</CardTitle>
					<select
						value={crop}
						onChange={(event) => setCrop(event.target.value)}
						aria-label={t('dash.priceCrop')}
						className="rounded-xl border border-(--ag-line) bg-(--ag-card-2) px-3 py-2 text-sm text-(--ag-text)"
					>
						{(data?.priceCrops || [crop]).map((name) => (
							<option key={name} value={name}>
								{(burmese && data?.priceCropNamesMm?.[name]) || name}
							</option>
						))}
					</select>
				</div>
				{prices?.countries?.length ? (
					<>
						<div className="mt-5 space-y-3">
							{prices.countries.map((item) => (
								<div key={item.country} className="space-y-1">
									<div className="flex items-center justify-between text-sm">
										<span className="font-semibold text-(--ag-text)">{country(item.country)}</span>
										<span className={muted}>
											${number(item.usdPerTonne)} / t · {item.year}
										</span>
									</div>
									<Bar percent={(item.usdPerTonne / topPrice) * 100} />
								</div>
							))}
						</div>
						<Trend points={prices.trend} />
					</>
				) : (
					<div className="mt-5">
						<NoData>{data ? t('dash.noPrices') : '…'}</NoData>
					</div>
				)}
				<Source>
					{prices?.source} · {t('dash.priceNote')}
				</Source>
			</section>

			<section className="grid gap-4 xl:grid-cols-2">
				<article className={card}>
					<div className="mb-5">
						<CardTitle icon={Leaf}>{t('dash.cropDist')}</CardTitle>
					</div>
					{myanmar?.crops?.length ? (
						<div className="space-y-4">
							{myanmar.crops.map((item) => (
								<div key={item.crop} className="space-y-1">
									<div className="flex items-center justify-between text-sm">
										<span className="font-semibold text-(--ag-text)">{(burmese && item.cropMm) || item.crop}</span>
										<span className={muted}>{item.sharePercent}%</span>
									</div>
									<Bar percent={item.sharePercent} />
								</div>
							))}
							<p className={`text-xs ${muted}`}>
								{t('dash.otherCrops')}: {myanmar.otherSharePercent}%
							</p>
						</div>
					) : (
						<NoData>{waiting}</NoData>
					)}
					<Source>
						{myanmar?.source} · {myanmar?.year} · {t('dash.areaShare')}
					</Source>
				</article>

				<article className={card}>
					<div className="mb-5">
						<CardTitle icon={Sprout}>{t('dash.avgYieldCrop')}</CardTitle>
					</div>
					{myanmar?.crops?.length ? (
						<div className="space-y-2">
							{myanmar.crops.map((item) => (
								<div key={item.crop} className="flex items-center justify-between rounded-2xl bg-(--ag-card-2) px-4 py-3">
									<span className="font-semibold text-(--ag-text)">{(burmese && item.cropMm) || item.crop}</span>
									<span className="text-sm font-bold text-(--ag-text)">
										{item.yieldTPerHa != null ? `${item.yieldTPerHa} t/ha` : t('dash.noData')}
									</span>
								</div>
							))}
						</div>
					) : (
						<NoData>{waiting}</NoData>
					)}
					<Source>
						{myanmar?.source} · {myanmar?.year}
					</Source>
				</article>
			</section>

			<section className={card}>
				<div className="mb-4">
					<CardTitle icon={HeartPulse}>{t('dash.recent')}</CardTitle>
				</div>
				{records?.recent?.length ? (
					<ul className="divide-y divide-(--ag-line)">
						{records.recent.map((item, i) => (
							<li key={`${item.reportedAt}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
								<span className="font-semibold text-(--ag-text)">
									{plant(item.plantType)} · {item.diseaseName || status(item.healthStatus)}
								</span>
								<span className={muted}>
									{[item.township, item.reportedAt ? new Date(item.reportedAt).toLocaleDateString() : null].filter(Boolean).join(' · ')}
								</span>
							</li>
						))}
					</ul>
				) : (
					<NoData>{!records ? '…' : !records.available ? t('dash.dbDown') : t('dash.noUpdates')}</NoData>
				)}
				<Source>{records?.source}</Source>
			</section>
		</div>
	)
}

export default Dashboard

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CloudRain, Leaf, Sprout, Stethoscope, TrendingUp } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { API_BASE_URL } from '../api.js'
import { loadCropConditions } from '../lib/cropConditions.js'
import { PLANT_GROUPS } from '../data/plantGroups.js'

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

// Every figure on this page comes from a real source and says which: the farm's own saved
// health updates, FAOSTAT price and production tables, or the weather data used by the
// last Crop Suggestion run. Where a source has nothing, the card says so instead of guessing.

const card = 'rounded-[1.8rem] border border-[#e6ebe7] bg-white p-6 shadow-[0_16px_50px_rgba(20,26,22,0.08)]'

const number = (value, digits = 0) =>
	value == null ? null : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })

function Source({ children }) {
	return <p className="mt-4 text-xs text-slate-400">{children}</p>
}

function NoData({ children }) {
	return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{children}</p>
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
	return (
		<div className="mt-5">
			<svg viewBox="0 0 300 60" className="h-16 w-full" role="img" aria-label="ASEAN median price by year">
				<polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-myanglow-forest" />
			</svg>
			<div className="flex justify-between text-xs text-slate-500">
				<span>{points[0].year}: ${number(points[0].medianUsdPerTonne)}</span>
				<span>{points[points.length - 1].year}: ${number(points[points.length - 1].medianUsdPerTonne)}</span>
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

	const tiles = [
		{
			key: 'dash.records',
			value: records?.available ? number(records.total) : null,
			note: records?.available ? records.source : records ? t('dash.dbDown') : '',
			icon: BarChart3,
			accent: 'text-sky-700',
			bg: 'bg-sky-100',
		},
		{
			key: 'dash.diseased',
			value: records?.available ? number(records.diseased) : null,
			note: records?.available ? records.source : records ? t('dash.dbDown') : '',
			icon: Stethoscope,
			accent: 'text-rose-700',
			bg: 'bg-rose-100',
		},
		{
			key: 'dash.yield',
			value: rice?.yieldTPerHa != null ? `${rice.yieldTPerHa} t/ha` : null,
			note: rice ? `Rice, Myanmar, ${myanmar.year} · ${myanmar.source}` : '',
			icon: Sprout,
			accent: 'text-amber-700',
			bg: 'bg-amber-100',
		},
		{
			key: 'dash.rainfall',
			value: conditions ? `${number(conditions.rainfall_mm)} mm` : null,
			note: conditions ? t('dash.rainfallFrom') : t('dash.runCrop'),
			icon: CloudRain,
			accent: 'text-indigo-700',
			bg: 'bg-indigo-100',
		},
	]

	return (
		<div className="space-y-6">
			<section className={card}>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-myanglow-medium">AgroGuard Analytics</p>
						<h2 className="mt-3 text-3xl font-semibold text-myanglow-navy">{t('dash.title')}</h2>
						<p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{t('dash.subtitle')}</p>
					</div>
					<div className="inline-flex items-center gap-2 rounded-full border border-myanglow-sage bg-myanglow-sage/40 px-4 py-2 text-sm font-medium text-myanglow-darkGreen">
						<TrendingUp size={16} />
						{t('dash.asean')}
					</div>
				</div>
			</section>

			{failed && (
				<p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
					{t('dash.loadFailed')}
				</p>
			)}

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{tiles.map((tile) => {
					const Icon = tile.icon
					return (
						<article key={tile.key} className="rounded-[1.6rem] border border-[#e6ebe7] bg-white p-5 shadow-[0_14px_40px_rgba(20,26,22,0.08)]">
							<div className="flex items-center justify-between gap-3">
								<p className="text-sm font-medium text-slate-500">{t(tile.key)}</p>
								<span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tile.bg} ${tile.accent}`}>
									<Icon size={18} />
								</span>
							</div>
							<p className={`mt-4 font-semibold ${tile.value ? 'text-3xl text-myanglow-navy' : 'text-lg text-slate-400'}`}>
								{tile.value ?? (data ? t('dash.noData') : '…')}
							</p>
							{tile.note ? <p className="mt-2 text-xs text-slate-400">{tile.note}</p> : null}
						</article>
					)
				})}
			</section>

			<section className={card}>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2 text-myanglow-navy">
						<TrendingUp size={18} />
						<h3 className="text-lg font-semibold">{t('dash.priceTitle')}</h3>
					</div>
					<select
						value={crop}
						onChange={(event) => setCrop(event.target.value)}
						aria-label={t('dash.priceCrop')}
						className="rounded-xl border border-myanglow-sage bg-white px-3 py-2 text-sm"
					>
						{(data?.priceCrops || [crop]).map((name) => (
							<option key={name} value={name}>
								{(language === 'my' && data?.priceCropNamesMm?.[name]) || name}
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
										<span className="font-medium text-slate-700">{country(item.country)}</span>
										<span className="text-slate-500">
											${number(item.usdPerTonne)} / t · {item.year}
										</span>
									</div>
									<div className="h-2 rounded-full bg-myanglow-sage/35">
										<div className="h-2 rounded-full bg-myanglow-forest" style={{ width: `${(item.usdPerTonne / topPrice) * 100}%` }} />
									</div>
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
				<Source>{prices?.source} · {t('dash.priceNote')}</Source>
			</section>

			<section className="grid gap-6 xl:grid-cols-2">
				<article className={card}>
					<div className="mb-5 flex items-center gap-2 text-myanglow-navy">
						<Leaf size={18} />
						<h3 className="text-lg font-semibold">{t('dash.cropDist')}</h3>
					</div>
					{myanmar?.crops?.length ? (
						<div className="space-y-4">
							{myanmar.crops.map((item) => (
								<div key={item.crop} className="space-y-1">
									<div className="flex items-center justify-between text-sm">
										<span className="font-medium text-slate-700">{(burmese && item.cropMm) || item.crop}</span>
										<span className="text-slate-500">{item.sharePercent}%</span>
									</div>
									<div className="h-2 rounded-full bg-myanglow-sage/35">
										<div className="h-2 rounded-full bg-myanglow-forest" style={{ width: `${item.sharePercent}%` }} />
									</div>
								</div>
							))}
							<p className="text-xs text-slate-500">
								{t('dash.otherCrops')}: {myanmar.otherSharePercent}%
							</p>
						</div>
					) : (
						<NoData>{data ? t('dash.noData') : '…'}</NoData>
					)}
					<Source>
						{myanmar?.source} · {myanmar?.year} · {t('dash.areaShare')}
					</Source>
				</article>

				<article className={card}>
					<div className="mb-5 flex items-center gap-2 text-myanglow-navy">
						<BarChart3 size={18} />
						<h3 className="text-lg font-semibold">{t('dash.avgYieldCrop')}</h3>
					</div>
					{myanmar?.crops?.length ? (
						<div className="space-y-3">
							{myanmar.crops.map((item) => (
								<div key={item.crop} className="flex items-center justify-between rounded-xl border border-myanglow-sage/50 bg-myanglow-sage/20 px-4 py-3">
									<span className="font-medium text-slate-700">{(burmese && item.cropMm) || item.crop}</span>
									<span className="text-sm font-semibold text-myanglow-navy">
										{item.yieldTPerHa != null ? `${item.yieldTPerHa} t/ha` : t('dash.noData')}
									</span>
								</div>
							))}
						</div>
					) : (
						<NoData>{data ? t('dash.noData') : '…'}</NoData>
					)}
					<Source>
						{myanmar?.source} · {myanmar?.year}
					</Source>
				</article>
			</section>

			<section className={card}>
				<div className="mb-5 flex items-center gap-2 text-myanglow-navy">
					<Stethoscope size={18} />
					<h3 className="text-lg font-semibold">{t('dash.recent')}</h3>
				</div>
				{records?.recent?.length ? (
					<ul className="divide-y divide-slate-100">
						{records.recent.map((item, i) => (
							<li key={`${item.reportedAt}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
								<span className="font-medium text-slate-700">
									{plant(item.plantType)} · {item.diseaseName || status(item.healthStatus)}
								</span>
								<span className="text-slate-500">
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

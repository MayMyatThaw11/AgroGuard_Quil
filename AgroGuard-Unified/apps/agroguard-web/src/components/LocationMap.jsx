import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Leaflet looks its marker images up relative to its own CSS, which a bundler
// moves; point it at the bundled copies instead.
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

// Starting view: all of Myanmar. Clicking anywhere in the world still works.
const START_VIEW = { center: [19.75, 96.1], zoom: 5 }
const PIN_ZOOM = 8

// A clickable OpenStreetMap. The parent owns the selected point (`pin`) and
// decides what a click does (`onPick`); this component only draws and reports.
export default function LocationMap({ pin, onPick, label }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick // the click handler is bound once, so always read the latest callback

  useEffect(() => {
    const map = L.map(containerRef.current, { worldCopyJump: true }).setView(
      START_VIEW.center,
      START_VIEW.zoom,
    )
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    map.on('click', (event) => {
      const { lat, lng } = map.wrapLatLng(event.latlng) // keep longitude within -180..180
      onPickRef.current?.(lat, lng)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Show the pin, and move the view to it when it was set from outside the
  // map (for example by "Detect my location") and is off-screen.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pin) return
    const latlng = [pin.lat, pin.lon]
    if (markerRef.current) markerRef.current.setLatLng(latlng)
    else markerRef.current = L.marker(latlng, { keyboard: false }).addTo(map)
    if (!map.getBounds().contains(latlng)) map.flyTo(latlng, Math.max(map.getZoom(), PIN_ZOOM))
  }, [pin])

  return <div ref={containerRef} className="location-map" role="application" aria-label={label} />
}

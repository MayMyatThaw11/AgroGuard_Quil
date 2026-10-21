import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const START_VIEW = { center: [20.0, 96.0], zoom: 6 }
const OUTLINE = { color: '#14742f', weight: 1, fillColor: '#8bcf77', fillOpacity: 0.18 }
const SELECTED = { color: '#0b4a1d', weight: 2.5, fillColor: '#17aa51', fillOpacity: 0.45 }

// District outlines on an OpenStreetMap. Clicking a district reports it to the parent, which
// owns the selection (`selected` is a PCODE, a state or a district) and the marker position.
export default function NdviRegionMap({ boundaries, selected, position, language, onSelect, label }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const markerRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect // click handlers are bound once, so always read the latest callback

  useEffect(() => {
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(START_VIEW.center, START_VIEW.zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
      markerRef.current = null
    }
  }, [])

  // Draw the outlines once they arrive, and again if the language changes the tooltip names.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !boundaries) return undefined
    const layer = L.geoJSON(boundaries, {
      style: () => OUTLINE,
      onEachFeature: (feature, shape) => {
        const props = feature.properties
        shape.bindTooltip(language === 'my' ? props.name_my : props.name_en, { sticky: true })
        shape.on('click', (event) => {
          L.DomEvent.stopPropagation(event)
          onSelectRef.current?.(props, [event.latlng.lat, event.latlng.lng])
        })
      },
    }).addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [boundaries, language])

  // Highlight the chosen district, or every district of the chosen state.
  useEffect(() => {
    layerRef.current?.eachLayer((shape) => {
      const { PCODE, state_pcode: state } = shape.feature.properties
      shape.setStyle(PCODE === selected || state === selected ? SELECTED : OUTLINE)
    })
  }, [selected, boundaries, language])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return
    if (markerRef.current) markerRef.current.setLatLng(position)
    else markerRef.current = L.marker(position, { keyboard: false }).addTo(map)
    map.setView(position, Math.max(map.getZoom(), 7))
  }, [position])

  return <div ref={containerRef} className="ndvi-map" role="application" aria-label={label} />
}

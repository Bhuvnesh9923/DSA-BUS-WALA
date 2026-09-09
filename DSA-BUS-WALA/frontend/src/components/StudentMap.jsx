import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ELURU_CENTER, TILE_LAYER_ATTRIBUTION, TILE_LAYER_URL } from '../constants/geo';
import SmoothBusMarker from './SmoothBusMarker';

const DEFAULT_CENTER = ELURU_CENTER;
const STOP_ICON_URL = '/markers/stop.png';

const createIcon = (iconUrl, options = {}) =>
  new L.Icon({
    iconUrl,
    iconSize: options.iconSize || [32, 48],
    iconAnchor: options.iconAnchor || [16, 46],
    popupAnchor: options.popupAnchor || [0, -36],
    className: options.className
  });

const stopIcon = createIcon(STOP_ICON_URL, {
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

// Destination stop icon — distinctive teal/green pin.
const destinationStopIcon = createIcon('/markers/stop.png', {
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  className: 'destination-stop-icon'
});

const FitBounds = ({ busPosition, stopPosition, destinationPosition }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const targets = [busPosition, stopPosition, destinationPosition].filter(Boolean);
    if (!targets.length) return;
    if (targets.length === 1) {
      map.setView(targets[0], 15, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(targets.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds.pad(0.25), { animate: true });
  }, [busPosition, stopPosition, destinationPosition, map]);
  return null;
};

const AnimatedMarker = ({ position, icon, popupText }) => {
  const markerRef = useRef(null);
  useEffect(() => {
    if (markerRef.current && position) {
      markerRef.current.setLatLng(position);
    }
  }, [position]);

  if (!position) return null;
  return <Marker ref={markerRef} position={position} icon={icon} title={popupText} />;
};

const StudentMap = ({ busPosition, stopPosition, destinationPosition, routePath }) => {
  const center = useMemo(() => busPosition || stopPosition || destinationPosition || DEFAULT_CENTER, [busPosition, stopPosition, destinationPosition]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Live map</p>
          <p className="text-sm text-slate-600">Bus & destination plotted on OpenStreetMap</p>
        </div>
      </div>
      <MapContainer center={center} zoom={15} minZoom={5} className="h-80 w-full" scrollWheelZoom>
        <TileLayer url={TILE_LAYER_URL} attribution={TILE_LAYER_ATTRIBUTION} />
        <SmoothBusMarker livePosition={busPosition} popupText="Bus" routePath={routePath} />
        <AnimatedMarker position={stopPosition} icon={stopIcon} popupText="Your stop" />
        {destinationPosition && (
          <AnimatedMarker position={destinationPosition} icon={destinationStopIcon} popupText="Destination" />
        )}
        <FitBounds busPosition={busPosition} stopPosition={stopPosition} destinationPosition={destinationPosition} />
      </MapContainer>
    </section>
  );
};

export default StudentMap;

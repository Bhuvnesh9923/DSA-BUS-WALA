import { useEffect, useMemo, useRef } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import useSmoothPosition from '../hooks/useSmoothPosition';

const BUS_ICON_URL = '/markers/bus.png';
const MARKER_SIZE = 48;
const MARKER_ANCHOR = MARKER_SIZE / 2;
// Only rebuild the rotated icon when the heading changes by this much (degrees).
const HEADING_ICON_DELTA = 6;

/**
 * Build a Leaflet divIcon that renders a CSS-pulsing ring + a rotated bus image.
 * Using HTML/CSS instead of canvas:
 *  - The pulse ring animates smoothly without re-rendering the icon on every frame.
 *  - The bus image is rotated via an inline transform; cheapest possible update.
 */
const buildBusIcon = (heading, isStale = false) => {
  const normalized = ((Math.round(heading) % 360) + 360) % 360;
  const rotate = -normalized; // bus.png points north; rotate clockwise to face heading
  const staleClass = isStale ? ' bus-marker-stale' : '';
  const html = `
    <div class="bus-marker-wrap${staleClass}">
      <span class="bus-pulse-ring"></span>
      <img
        class="bus-marker-icon"
        src="${BUS_ICON_URL}"
        alt="bus"
        style="transform: rotate(${rotate}deg);"
      />
    </div>
  `;
  return L.divIcon({
    className: 'bus-div-icon',
    html,
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_ANCHOR, MARKER_ANCHOR],
    popupAnchor: [0, -MARKER_ANCHOR]
  });
};

// LRU cache of heading → icon so we don't rebuild the DOM for every tiny turn.
const ICON_CACHE_LIMIT = 64;
const iconCache = new Map();
const getCachedIcon = (heading, isStale = false) => {
  const normalized = ((Math.round(heading) % 360) + 360) % 360;
  const cacheKey = `${normalized}:${isStale ? 'stale' : 'live'}`;
  if (iconCache.has(cacheKey)) {
    const icon = iconCache.get(cacheKey);
    // Refresh LRU recency.
    iconCache.delete(cacheKey);
    iconCache.set(cacheKey, icon);
    return icon;
  }
  const icon = buildBusIcon(normalized, isStale);
  iconCache.set(cacheKey, icon);
  if (iconCache.size > ICON_CACHE_LIMIT) {
    // Evict oldest (first key in Map iteration order = least recently used).
    const oldest = iconCache.keys().next().value;
    iconCache.delete(oldest);
  }
  return icon;
};

const SmoothBusMarker = ({
  livePosition,
  durationMs,
  popupText = 'Bus',
  enabled = true,
  queueUpdates = true,
  routePath = null,
  staleAfterMs
}) => {
  const { position, heading, isStale } = useSmoothPosition({
    livePosition,
    durationMs,
    enabled,
    queueUpdates,
    routePath,
    staleAfterMs
  });

  const markerRef = useRef(null);
  const lastRenderedHeadingRef = useRef(null);

  // Initial icon (heading 0). The effect below swaps it in as the bus turns.
  const initialIcon = useMemo(() => getCachedIcon(0, false), []);

  // Keep the marker positioned on every interpolated frame (smooth glide).
  useEffect(() => {
    if (markerRef.current && position) {
      markerRef.current.setLatLng([position.lat, position.lng]);
    }
  }, [position]);

  // Swap icon when the bus turns enough OR when stale/live status flips.
  useEffect(() => {
    if (!markerRef.current) return;
    const last = lastRenderedHeadingRef.current;
    const staleChanged = last?.isStale !== isStale;
    if (last == null || Math.abs(heading - last.heading) >= HEADING_ICON_DELTA || staleChanged) {
      markerRef.current.setIcon(getCachedIcon(heading, isStale));
      lastRenderedHeadingRef.current = { heading, isStale };
    }
  }, [heading, isStale]);

  if (!position) return null;

  return (
    <Marker
      ref={markerRef}
      position={[position.lat, position.lng]}
      icon={initialIcon}
      title={popupText}
    />
  );
};

export default SmoothBusMarker;

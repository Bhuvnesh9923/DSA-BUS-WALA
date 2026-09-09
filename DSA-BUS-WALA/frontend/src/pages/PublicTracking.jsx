import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';
import { ELURU_CENTER, TILE_LAYER_ATTRIBUTION, TILE_LAYER_URL } from '../constants/geo';
import SmoothBusMarker from '../components/SmoothBusMarker';

import { API_ROOT, API_BASE_URL } from '../constants/api';

const SOCKET_URL = API_BASE_URL || window.location.origin;

const stopIcon = new L.Icon({
    iconUrl: '/markers/stop.png',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
});

// Auto-fit map bounds
const FitBounds = ({ positions }) => {
    const map = useMap();
    useEffect(() => {
        // Force Leaflet to recalculate size after mount
        setTimeout(() => map.invalidateSize(), 100);
        if (!positions?.length) return;
        if (positions.length === 1) {
            map.setView(positions[0], 15, { animate: true });
        } else {
            const bounds = L.latLngBounds(positions);
            map.fitBounds(bounds.pad(0.15), { animate: true });
        }
    }, [positions, map]);
    return null;
};

const PublicTracking = () => {
    const { busName } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busPosition, setBusPosition] = useState(null);
    const socketRef = useRef(null);
    // ── REST / Socket race guard ──
    // Socket location updates are fresher than the polled REST `lastLocation`.
    const hasFreshSocketRef = useRef(false);
    const freshSocketTimestampRef = useRef(0);
    const FRESH_SOCKET_WINDOW_MS = 15000; // 15s

    // Fetch bus data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_ROOT}/public/track/${encodeURIComponent(busName)}`);
                const json = await res.json();
                if (!res.ok || !json.found) {
                    setError(json.message || 'Bus not found');
                    setData(null);
                } else {
                    setData(json);
                    // Set initial bus position (but don't clobber a fresher socket update)
                    const loc = json.trip?.lastLocation || json.bus?.lastKnownLocation;
                    if (loc?.lat && loc?.lng) {
                        const freshSocket = hasFreshSocketRef.current &&
                            Date.now() - freshSocketTimestampRef.current < FRESH_SOCKET_WINDOW_MS;
                        if (!freshSocket) {
                            setBusPosition({ lat: loc.lat, lng: loc.lng });
                        }
                    }
                }
            } catch {
                setError('Failed to connect. Check your internet connection.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        // Re-poll every 60s in case trip starts/ends
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [busName]);

    // Socket connection for live updates
    useEffect(() => {
        if (!data?.active || !data?.trip?._id) return;
        const tripId = data.trip._id;

        const sock = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000
        });

        sock.on('connect', () => {
            sock.emit('public:subscribe', { tripId });
        });

        sock.on('trip:location_update', (payload) => {
            if (payload?.lat && payload?.lng) {
                // Mark socket as the freshest source so polled REST can't clobber it.
                hasFreshSocketRef.current = true;
                freshSocketTimestampRef.current = Date.now();
                setBusPosition({ lat: payload.lat, lng: payload.lng });
            }
        });

        sock.on('trip:stop_arrived', (payload) => {
            setData(prev => prev ? {
                ...prev,
                trip: { ...prev.trip, currentStopIndex: payload.stopIndex }
            } : prev);
        });

        socketRef.current = sock;
        return () => { sock.disconnect(); socketRef.current = null; };
    }, [data?.active, data?.trip?._id]);

    // Build map markers
    const stopMarkers = useMemo(() => {
        if (!data?.route?.stops?.length) return [];
        return [...data.route.stops]
            .sort((a, b) => (a.seq || 0) - (b.seq || 0))
            .map((s) => ({
                position: [s.lat, s.lng],
                name: s.name,
                seq: s.seq
            }));
    }, [data?.route?.stops]);

    const routeLine = useMemo(() => {
        if (data?.route?.geojson?.coordinates) {
            return data.route.geojson.coordinates.map(([lng, lat]) => [lat, lng]);
        }
        return stopMarkers.map(s => s.position);
    }, [data?.route?.geojson, stopMarkers]);

    const fitPositions = useMemo(() => {
        const pts = [];
        if (busPosition) pts.push([busPosition.lat, busPosition.lng]);
        stopMarkers.forEach(s => pts.push(s.position));
        return pts.length ? pts : [[ELURU_CENTER.lat, ELURU_CENTER.lng]];
    }, [busPosition, stopMarkers]);

    const currentStop = data?.trip?.currentStopIndex != null && stopMarkers[data.trip.currentStopIndex]
        ? stopMarkers[data.trip.currentStopIndex]
        : null;

    const nextStop = data?.trip?.currentStopIndex != null && stopMarkers[data.trip.currentStopIndex + 1]
        ? stopMarkers[data.trip.currentStopIndex + 1]
        : null;

    // ── RENDER ──

    if (loading) {
        return (
            <div style={styles.fullCenter}>
                <div style={styles.spinner} />
                <p style={styles.loadingText}>Looking up <strong>{decodeURIComponent(busName)}</strong>...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.fullCenter}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚌</div>
                <h2 style={styles.errorTitle}>Bus Not Found</h2>
                <p style={styles.errorText}>{error}</p>
                <p style={styles.hint}>Check the bus name or number plate and try again.</p>
            </div>
        );
    }

    if (data && !data.active) {
        return (
            <div style={styles.fullCenter}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💤</div>
                <h2 style={styles.inactiveTitle}>{data.bus?.name || busName}</h2>
                <p style={styles.inactiveText}>This bus is not currently running.</p>
                <p style={styles.hint}>The page will auto-refresh when a trip starts.</p>
                <div style={styles.plate}>{data.bus?.numberPlate}</div>
            </div>
        );
    }

    return (
        <div style={styles.page}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerLeft}>
                    <img src="/favicons/android-chrome-192x192.png" alt="TrackMate" style={styles.logo} />
                    <div>
                        <h1 style={styles.headerTitle}>TrackMate</h1>
                        <p style={styles.headerSub}>Public Bus Tracking</p>
                    </div>
                </div>
                <div style={styles.liveBadge}>
                    <span style={styles.liveDot} />
                    LIVE
                </div>
            </header>

            {/* Info Bar */}
            <div style={styles.infoBar}>
                <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Bus</span>
                    <span style={styles.infoValue}>{data.bus?.name}</span>
                </div>
                <div style={styles.infoDivider} />
                <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Plate</span>
                    <span style={styles.infoValue}>{data.bus?.numberPlate}</span>
                </div>
                <div style={styles.infoDivider} />
                <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Route</span>
                    <span style={styles.infoValue}>{data.route?.name || '—'}</span>
                </div>
                {nextStop && (
                    <>
                        <div style={styles.infoDivider} />
                        <div style={styles.infoItem}>
                            <span style={styles.infoLabel}>Next Stop</span>
                            <span style={styles.infoValue}>{nextStop.name}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Map */}
            <div style={styles.mapWrapper}>
                <MapContainer center={[ELURU_CENTER.lat, ELURU_CENTER.lng]} zoom={13} minZoom={5} style={{ height: 'calc(100vh - 110px)', width: '100%' }} scrollWheelZoom>
                    <TileLayer url={TILE_LAYER_URL} attribution={TILE_LAYER_ATTRIBUTION} />
                    <SmoothBusMarker livePosition={busPosition} routePath={routeLine} />
                    {stopMarkers.map((s, i) => (
                        <Marker
                            key={i}
                            position={s.position}
                            icon={stopIcon}
                            title={s.name}
                            opacity={currentStop && s.seq < currentStop.seq ? 0.4 : 1}
                        />
                    ))}
                    {routeLine.length > 1 && (
                        <Polyline positions={routeLine} pathOptions={{ color: '#6366f1', weight: 3, opacity: 0.6 }} />
                    )}
                    <FitBounds positions={fitPositions} />
                </MapContainer>
            </div>

            {/* Footer */}
            <footer style={styles.footer}>
                <p>Powered by <strong>TrackMate</strong> — RCEE Bus Tracking System</p>
            </footer>
        </div>
    );
};

const styles = {
    page: {
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        color: '#e2e8f0'
    },
    fullCenter: {
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e2e8f0',
        textAlign: 'center',
        padding: '2rem'
    },
    spinner: {
        width: 40, height: 40,
        border: '3px solid rgba(255,255,255,0.15)',
        borderTop: '3px solid #ff6b2c',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        marginBottom: '1rem'
    },
    loadingText: { color: '#94a3b8', fontSize: '0.95rem' },
    errorTitle: { fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' },
    errorText: { color: '#94a3b8', fontSize: '0.95rem', marginBottom: '0.5rem' },
    inactiveTitle: { fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' },
    inactiveText: { color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1rem' },
    hint: { color: '#64748b', fontSize: '0.8rem' },
    plate: {
        marginTop: '1rem',
        background: 'rgba(255,255,255,0.08)',
        padding: '0.5rem 1.2rem',
        borderRadius: '0.5rem',
        fontWeight: 600,
        fontSize: '0.95rem',
        letterSpacing: '0.05em'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.25rem',
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        zIndex: 10
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    logo: { width: 36, height: 36, borderRadius: 8 },
    headerTitle: { fontSize: '1.1rem', fontWeight: 700, margin: 0, lineHeight: 1.2 },
    headerSub: { fontSize: '0.7rem', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' },
    liveBadge: {
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        background: 'rgba(34,197,94,0.15)',
        color: '#4ade80',
        padding: '0.3rem 0.75rem',
        borderRadius: '0.5rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.1em'
    },
    liveDot: {
        width: 8, height: 8,
        borderRadius: '50%',
        background: '#4ade80',
        boxShadow: '0 0 6px #4ade80',
        animation: 'pulse 1.5s ease-in-out infinite'
    },
    infoBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 1.25rem',
        background: 'rgba(30,41,59,0.7)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        fontSize: '0.8rem'
    },
    infoItem: { display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 },
    infoLabel: { fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' },
    infoValue: { fontWeight: 600, color: '#e2e8f0', fontSize: '0.85rem' },
    infoDivider: { width: 1, height: 28, background: 'rgba(255,255,255,0.08)', flexShrink: 0 },
    mapWrapper: { flex: 1, minHeight: 0, height: 'calc(100vh - 110px)' },
    footer: {
        padding: '0.5rem',
        textAlign: 'center',
        fontSize: '0.7rem',
        color: '#475569',
        borderTop: '1px solid rgba(255,255,255,0.04)'
    }
};

export default PublicTracking;

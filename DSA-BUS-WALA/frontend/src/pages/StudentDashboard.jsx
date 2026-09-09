import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  MapPin, Navigation, Bell, BellOff, RefreshCw, Phone,
  ChevronRight, AlertTriangle, Gauge, Clock, Bus, Volume2, Settings,
  ArrowRightLeft, XCircle, Loader2
} from 'lucide-react';
import StudentMap from '../components/StudentMap';
import { useSocket } from '../hooks/useSocket';
import { api } from '../utils/api';
import { formatETA, computeFallbackETA } from '../utils/etaUtils';
import { useAuth } from '../hooks/useAuth';
import TrackMateLoader from '../components/TrackMateLoader';

const TOKEN_KEY = 'tm_token';
const NOTIFICATION_PREF_KEY = 'tm_student_notifications';
const EVENTS_STORAGE_KEY = 'tm_student_events';
const DEPARTED_STORAGE_KEY = 'tm_student_departed';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BB-mUg8K2OcS2V132PRVreEUU-EcR_QEnM5mcGGbxpF2sI-N1HM8OwA2fw4lhhvI8Zg0kyJaBtSsSxBvgbUp6zA';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const normalizeLocation = (location) => {
  if (!location) return null;
  const lat = location.lat ?? location.latitude ?? location?.coords?.lat ?? location?.location?.lat;
  const lng = location.lng ?? location.longitude ?? location?.coords?.lng ?? location?.location?.lng;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
};

const normalizeStop = (data = {}) => data?.stop || data?.assignedStop || data?.assignment?.stop || null;
const normalizeBus = (data = {}) => data?.bus || data?.assignment?.bus || null;
const deriveTripId = (data = {}) => data?.currentTripId || data?.tripId || data?.activeTrip?._id || null;

// ===== COMPONENTS =====

const StatCard = ({ icon: Icon, label, value, subtext, highlight }) => (
  <div className={`sd-stat-card ${highlight ? 'sd-stat-highlight' : ''}`}>
    <div className="sd-stat-icon-wrap">
      <div className={`sd-stat-icon ${highlight ? 'sd-stat-icon-active' : ''}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <p className="sd-stat-label">{label}</p>
    <p className={`sd-stat-value ${highlight ? 'sd-stat-value-active' : ''}`}>{value}</p>
    {subtext && <p className="sd-stat-subtext">{subtext}</p>}
  </div>
);

const QuickAction = ({ icon: Icon, label, onClick, variant = 'default', disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`sd-action sd-action-${variant}`}
  >
    <Icon className="w-6 h-6" />
    <span className="sd-action-label">{label}</span>
  </button>
);

const EventItem = ({ event }) => (
  <div className="sd-event-item">
    <div className="sd-event-line" />
    <div className={`sd-event-dot ${event.type === 'ARRIVED' ? 'sd-event-dot-arrived' : 'sd-event-dot-left'}`}>
      {event.type === 'ARRIVED' ? (
        <MapPin className="w-3.5 h-3.5" />
      ) : (
        <Navigation className="w-3.5 h-3.5" />
      )}
    </div>
    <div className="sd-event-content">
      <p className="sd-event-text">
        {event.type === 'ARRIVED' ? 'Arrived at' : 'Left'} <span className="sd-event-stop">{event.stopName}</span>
      </p>
      <p className="sd-event-time">{new Date(event.timestamp).toLocaleTimeString()}</p>
    </div>
  </div>
);

// ===== MAIN COMPONENT =====

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [profile, setProfile] = useState(user);
  const [busPosition, setBusPosition] = useState(null);
  const [stopInfo, setStopInfo] = useState(null);
  const [tripId, setTripId] = useState(null);
  const [journey, setJourney] = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [eta, setEta] = useState(null);
  const [busSpeed, setBusSpeed] = useState(0);
  const [visitorCount, setVisitorCount] = useState(0);
  const [sosAlert, setSosAlert] = useState(null);
  const [historyEvents, setHistoryEvents] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(EVENTS_STORAGE_KEY));
      return Array.isArray(stored?.events) ? stored.events : [];
    } catch { return []; }
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true'
  );
  const [permission, setPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState({
    enabled: true,
    proximityMinutes: 5,
    proximityMeters: 500,
    arrivalAlert: true
  });
  // Track when bus has departed from student's stop
  const [stopDepartedInfo, setStopDepartedInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DEPARTED_STORAGE_KEY)); } catch { return null; }
  });
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // ── REST / Socket race guard ──
  // Socket location updates are fresher than the REST `lastKnownLocation`.
  // Track the last socket-received position and only let REST fill gaps.
  const socketPositionRef = useRef(null);
  const hasFreshSocketRef = useRef(false);
  const freshSocketTimestampRef = useRef(0);
  const FRESH_SOCKET_WINDOW_MS = 15000; // 15s

  // Missed bus redirect state
  const [redirectInfo, setRedirectInfo] = useState(null);
  const [redirectLoading, setRedirectLoading] = useState(false);
  const redirectInfoRef = useRef(null);
  // Keep ref in sync so memoized fetchProfile can read current redirect state
  useEffect(() => { redirectInfoRef.current = redirectInfo; }, [redirectInfo]);

  const subscribedTripRef = useRef(null);
  const previousTripIdRef = useRef(() => {
    // Restore previous trip ID from stored events so we don't wipe them on refresh
    try {
      const stored = localStorage.getItem(EVENTS_STORAGE_KEY);
      if (stored) {
        const events = JSON.parse(stored);
        return events._tripId || null;
      }
    } catch { /* ignore */ }
    return null;
  });
  // Initialize ref value from the factory
  if (typeof previousTripIdRef.current === 'function') {
    previousTripIdRef.current = previousTripIdRef.current();
  }

  // Socket handlers
  const handleLocationUpdate = useCallback((payload) => {
    if (!payload) return;
    const newPos = normalizeLocation(payload);
    if (newPos) {
      // Socket data is the freshest source — remember it so REST polling
      // cannot overwrite the live bus position with a stale DB snapshot.
      socketPositionRef.current = newPos;
      hasFreshSocketRef.current = true;
      freshSocketTimestampRef.current = Date.now();
      setBusPosition(newPos);
      if (typeof payload.speed === 'number') setBusSpeed(payload.speed);
    }
  }, []);

  const handleEtaUpdate = useCallback((payload) => {
    if (!payload || !stopInfo) return;
    const targetSeq = String(stopInfo?.seq ?? stopInfo?.sequence ?? '');

    // Try etasMap first
    if (payload?.etasMap && typeof payload.etasMap[targetSeq] === 'number') {
      setEta({ value: payload.etasMap[targetSeq], source: 'server', updatedAt: Date.now() });
      return;
    }

    // Try etas array
    if (Array.isArray(payload?.etas)) {
      const match = payload.etas.find(e => String(e.stopId) === targetSeq);
      if (match?.etaMs) {
        setEta({ value: match.etaMs, source: 'server', updatedAt: Date.now() });
      }
    }
  }, [stopInfo]);

  const handleStopEvent = useCallback((payload, type) => {
    const event = {
      type,
      stopName: payload?.stopName || `Stop ${payload?.stopIndex ?? ''}`,
      stopIndex: payload?.stopIndex,
      timestamp: payload?.timestamp || Date.now()
    };
    setHistoryEvents(prev => {
      const updated = [event, ...prev].slice(0, 10);
      // Persist to localStorage with trip ID
      try { localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify({ _tripId: previousTripIdRef.current, events: updated })); } catch { /* ignore */ }
      return updated;
    });

    // ── Redirect-aware: detect when redirected bus reaches the matching stop ──
    const redirect = redirectInfoRef.current;
    if (redirect) {
      const matchSeq = redirect.matchingStop?.seq;
      if (matchSeq != null && payload?.stopIndex === matchSeq && type === 'ARRIVED') {
        // Redirected bus arrived at student's stop!
        setRedirectInfo(prev => ({ ...prev, arrived: true, etaMinutes: 0, etaMs: 0 }));
        toast.success('Your alternative bus has arrived at your stop!', { icon: '🎉', duration: 6000 });
        return;
      }
      if (matchSeq != null && payload?.stopIndex > matchSeq) {
        // Redirected bus passed the stop — auto-clear redirect
        setRedirectInfo(null);
        toast('Redirected bus has passed your stop', { icon: '⚠️', duration: 4000 });
        return;
      }
      // Update stops-away count for redirected bus
      if (matchSeq != null && typeof payload?.stopIndex === 'number') {
        const newStopsAway = matchSeq - payload.stopIndex;
        if (newStopsAway >= 0) {
          setRedirectInfo(prev => prev ? { ...prev, stopsAway: newStopsAway } : prev);
        }
      }
    }

    // Check if this is the student's original stop
    const studentStopSeq = stopInfo?.seq ?? stopInfo?.sequence;
    const isMyStop = studentStopSeq != null && payload?.stopIndex === studentStopSeq;

    if (isMyStop) {
      if (type === 'ARRIVED') {
        // Bus arrived at student's stop
        const info = { arrivedAt: event.timestamp, stopName: event.stopName };
        setStopDepartedInfo(prev => {
          const updated = { ...prev, ...info };
          try { localStorage.setItem(DEPARTED_STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
        toast.success(`Bus has arrived at your stop!`, { icon: '🎉', duration: 5000 });
      } else if (type === 'LEFT') {
        // Bus left student's stop - switch to departed mode
        const info = { departedAt: event.timestamp, stopName: event.stopName, hasDeparted: true };
        setStopDepartedInfo(prev => {
          const updated = { ...prev, ...info };
          try { localStorage.setItem(DEPARTED_STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
        toast('Bus has departed from your stop', { icon: '🚌', duration: 5000 });
      }
    } else {
      // Only show toasts for non-redirect stop events (avoid noise)
      if (!redirect) {
        toast[type === 'ARRIVED' ? 'success' : 'custom'](
          `Bus ${type === 'ARRIVED' ? 'arrived at' : 'left'} ${event.stopName}`,
          { icon: type === 'ARRIVED' ? '📍' : '🚌' }
        );
      }
    }
    fetchProfile();
  }, [stopInfo]);

  // Use a ref so socket handlers can call fetchProfile without a dependency-order issue
  const fetchProfileRef = useRef(null);

  const socketHandlers = useMemo(() => ({
    'trip:location_update': handleLocationUpdate,
    'trip:eta_update': handleEtaUpdate,
    'trip:stop_arrived': (p) => handleStopEvent(p, 'ARRIVED'),
    'trip:stop_left': (p) => handleStopEvent(p, 'LEFT'),
    'trip:sos': setSosAlert,
    'stats:live_visitors': setVisitorCount,
    'bus:trip_started': () => {
      // Instantly refresh when a driver starts a trip
      fetchProfileRef.current?.();
    },
    'bus:trip_ended': () => {
      // Instantly refresh when a trip ends
      // If redirect is active and the redirected trip ended, clear it
      if (redirectInfoRef.current) {
        setRedirectInfo(null);
        toast('Redirected trip has ended', { icon: 'ℹ️' });
      }
      fetchProfileRef.current?.();
    },
  }), [handleLocationUpdate, handleEtaUpdate, handleStopEvent]);

  const { socket, isConnected } = useSocket(socketHandlers);
  const isAuthenticated = !!localStorage.getItem(TOKEN_KEY);

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/students/me').catch(() => api.get('/auth/me'));
      const data = response.data;

      setProfile({ ...user, ...data });
      setStopInfo(normalizeStop(data));
      // Don't overwrite bus position if redirect is active
      // OR if a fresher socket position was received within the window.
      const restPos = normalizeLocation(normalizeBus(data)?.lastKnownLocation);
      const freshSocket = hasFreshSocketRef.current &&
        Date.now() - freshSocketTimestampRef.current < FRESH_SOCKET_WINDOW_MS;
      if (!redirectInfoRef.current && !freshSocket) {
        setBusPosition(restPos);
      }

      const tripRes = await api.get('/students/trip').catch(() => ({ data: null }));
      if (tripRes.data) {
        const newTripId = tripRes.data._id;

        // Reset departed state and events only if this is a genuinely different trip
        if (previousTripIdRef.current && newTripId !== previousTripIdRef.current) {
          setStopDepartedInfo(null);
          setHistoryEvents([]);
          localStorage.removeItem(EVENTS_STORAGE_KEY);
          localStorage.removeItem(DEPARTED_STORAGE_KEY);
        }

        previousTripIdRef.current = newTripId;
        setTripId(newTripId);
        // Build a [lat, lng] route path from the geojson so the marker follows the road.
        const routeGeo = tripRes.data?.route?.geojson?.coordinates;
        const routePath = Array.isArray(routeGeo)
          ? routeGeo.map(([lng, lat]) => [lat, lng])
          : (tripRes.data?.route?.stops || []).map((s) => [s.lat, s.lng]);
        setJourney({
          currentStop: tripRes.data.currentStop,
          nextStop: tripRes.data.nextStop,
          progress: tripRes.data.progress,
          routePath
        });
        if (tripRes.data.driver) setDriverInfo(tripRes.data.driver);
        // Don't overwrite bus position if redirect is active
        // OR if a fresher socket position was received within the window.
        if (!redirectInfoRef.current && !freshSocket) {
          const livePos = normalizeLocation(tripRes.data?.bus?.lastKnownLocation);
          if (livePos) setBusPosition(livePos);
        }

        setStatusMessage('Live tracking active');
      } else {
        // No active trip - trip has ended, clear everything
        if (previousTripIdRef.current) {
          previousTripIdRef.current = null;
          setTripId(null);
          setStopDepartedInfo(null);
          setHistoryEvents([]);
          setEta(null);
          setBusPosition(null);
          setJourney(null);
          localStorage.removeItem(EVENTS_STORAGE_KEY);
          localStorage.removeItem(DEPARTED_STORAGE_KEY);
        }
        setStatusMessage('Waiting for driver to start trip');
      }

      // Fetch ETA only if there's an active trip
      if (tripRes.data) {
        const etaRes = await api.get('/students/eta').catch(() => ({ data: {} }));
        if (typeof etaRes.data?.etaMinutes === 'number') {
          setEta({ value: etaRes.data.etaMinutes * 60 * 1000, source: 'server', updatedAt: Date.now() });
        }
      }
    } catch (err) {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
      setLastRefreshed(Date.now());
    }
  }, [user]);

  // ── Missed Bus Redirect Handlers ──
  const handleMissedBus = async () => {
    setRedirectLoading(true);
    try {
      const { data } = await api.post('/students/missed-bus');
      if (data.found && data.redirect) {
        setRedirectInfo(data.redirect);
        // Show redirected bus on the map immediately
        const loc = normalizeLocation(data.redirect.redirectedBus?.lastKnownLocation);
        if (loc) setBusPosition(loc);
        toast.success(data.message, { icon: '🔄', duration: 5000 });
      } else {
        toast(data.message || 'No alternative buses available', { icon: '😔', duration: 4000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to find alternative bus');
    } finally {
      setRedirectLoading(false);
    }
  };

  const handleCancelRedirect = async () => {
    try {
      await api.post('/students/cancel-redirect');
      setRedirectInfo(null);
      toast('Back to your original bus', { icon: '🚌' });
      fetchProfile(); // This restores original bus position on map
    } catch {
      toast.error('Failed to cancel redirect');
    }
  };

  // Check redirect status on mount (restore after page refresh)
  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const { data } = await api.get('/students/redirect-status');
        if (data.active && data.redirect) {
          setRedirectInfo(data.redirect);
          // Restore redirected bus position on map
          const loc = normalizeLocation(data.redirect.redirectedBus?.lastKnownLocation);
          if (loc) setBusPosition(loc);
        }
      } catch { /* ignore */ }
    };
    checkRedirect();
  }, []);

  // Keep ref in sync so socket handlers always call the latest version
  fetchProfileRef.current = fetchProfile;

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
    fetchProfile();
  }, [fetchProfile]);

  // Subscribe to trip socket (use redirected trip if active)
  const activeTripId = redirectInfo?.redirectedTripId || tripId;
  useEffect(() => {
    if (!socket || !activeTripId || !isAuthenticated) return;
    socket.emit('student:subscribe', { tripId: activeTripId });
    subscribedTripRef.current = activeTripId;
    return () => {
      socket.emit('student:unsubscribe', { tripId: activeTripId });
    };
  }, [socket, activeTripId, isAuthenticated]);

  // Auto-refresh every 30 seconds (pauses when tab is hidden)
  useEffect(() => {
    const POLL_INTERVAL_MS = 30000; // 30 seconds
    let intervalId = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        fetchProfile();
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchProfile(); // Refresh immediately when tab becomes visible
        startPolling();
      } else {
        stopPolling(); // Save battery when tab is hidden
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchProfile]);

  // Fallback ETA calculation
  useEffect(() => {
    if (eta?.source === 'server' && Date.now() - eta.updatedAt < 10000) return;
    if (busPosition && stopInfo) {
      const fallback = computeFallbackETA(busPosition, normalizeLocation(stopInfo), busSpeed || 5);
      if (fallback) setEta(prev => {
        // Skip update if value hasn't meaningfully changed (within 5s)
        if (prev?.source === 'fallback' && Math.abs((prev.value || 0) - fallback) < 5000) return prev;
        return { value: fallback, source: 'fallback', updatedAt: Date.now() };
      });
    }
  }, [busPosition, stopInfo, busSpeed]);

  // Push notification handlers
  const enableNotifications = async () => {
    if (!('Notification' in window)) return toast.error('Not supported');
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== 'granted') return toast.error('Permission denied');

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      await api.post('/notifications/subscribe', sub);
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIFICATION_PREF_KEY, 'true');
      toast.success('Notifications enabled');
    } catch (err) {
      toast.error('Failed to enable notifications');
    }
  };

  const disableNotifications = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    } catch { }
    setNotificationsEnabled(false);
    localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
    toast('Notifications disabled', { icon: '🔕' });
  };

  // Fetch and save notification preferences
  const fetchPreferences = async () => {
    try {
      const res = await api.get('/students/preferences');
      setPreferences(res.data);
    } catch { }
  };

  const savePreferences = async (newPrefs) => {
    try {
      await api.put('/students/preferences', newPrefs);
      setPreferences(prev => ({ ...prev, ...newPrefs }));
      toast.success('Preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    }
  };

  useEffect(() => { fetchPreferences(); }, []);

  const speakStatus = () => {
    if (!('speechSynthesis' in window)) return;
    const etaText = eta?.value ? formatETA(eta.value) : 'unknown';
    const text = `Your bus will arrive at ${stopInfo?.name || 'your stop'} in approximately ${etaText}`;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const formattedEta = eta?.value ? formatETA(eta.value) : '—';
  // When redirected, show the matching stop on the map instead of the original stop
  const stopPosition = redirectInfo?.matchingStop
    ? normalizeLocation(redirectInfo.matchingStop)
    : stopInfo ? normalizeLocation(stopInfo) : null;

  // Loading state
  if (loading) {
    return <TrackMateLoader message="Loading your dashboard..." />;
  }

  // Error state
  if (error) {
    return (
      <main className="sd-page sd-center">
        <div className="sd-card sd-error-card">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Something went wrong</p>
          <p className="sd-muted-text mb-4">{error}</p>
          <button onClick={fetchProfile} className="sd-btn-primary px-6 py-2.5">
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="sd-page">
      {/* SOS Alert Modal */}
      {sosAlert && (
        <div className="sd-modal-overlay">
          <div className="sd-modal sd-sos-modal">
            <div className="sd-sos-icon">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Emergency Alert</h2>
            <p className="text-red-200 mb-4">{sosAlert.message}</p>
            <button onClick={() => setSosAlert(null)} className="sd-modal-dismiss">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="sd-modal-overlay">
          <div className="sd-modal sd-settings-modal">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Alert Settings</h2>
              <button onClick={() => setShowSettings(false)} className="sd-modal-close">✕</button>
            </div>

            <div className="space-y-6">
              {/* Proximity Minutes */}
              <div>
                <label className="sd-settings-label">
                  Alert when bus is within: <span className="sd-accent-text font-bold">{preferences.proximityMinutes} min</span>
                </label>
                <input
                  type="range"
                  min="1" max="30"
                  value={preferences.proximityMinutes}
                  onChange={(e) => setPreferences(p => ({ ...p, proximityMinutes: Number(e.target.value) }))}
                  className="sd-range"
                />
                <div className="flex justify-between text-xs sd-range-labels mt-1">
                  <span>1 min</span><span>15 min</span><span>30 min</span>
                </div>
              </div>

              {/* Proximity Meters */}
              <div>
                <label className="sd-settings-label">
                  Or within: <span className="sd-accent-text font-bold">{preferences.proximityMeters}m</span>
                </label>
                <input
                  type="range"
                  min="100" max="2000" step="100"
                  value={preferences.proximityMeters}
                  onChange={(e) => setPreferences(p => ({ ...p, proximityMeters: Number(e.target.value) }))}
                  className="sd-range"
                />
                <div className="flex justify-between text-xs sd-range-labels mt-1">
                  <span>100m</span><span>1km</span><span>2km</span>
                </div>
              </div>

              {/* Arrival Alert Toggle */}
              <div className="sd-toggle-row">
                <span className="text-white">Arrival alerts</span>
                <button
                  onClick={() => setPreferences(p => ({ ...p, arrivalAlert: !p.arrivalAlert }))}
                  className={`sd-toggle ${preferences.arrivalAlert ? 'sd-toggle-on' : 'sd-toggle-off'}`}
                >
                  <span className={`sd-toggle-dot ${preferences.arrivalAlert ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            <button
              onClick={() => { savePreferences(preferences); setShowSettings(false); }}
              className="sd-btn-primary w-full mt-6"
            >
              Save Preferences
            </button>
          </div>
        </div>
      )}

      <div className="sd-container">
        {/* Header */}
        <header className="sd-header sd-card-animate">
          <div>
            <p className="sd-header-sub">Welcome back,</p>
            <h1 className="sd-header-name">{profile?.name || user?.username}</h1>
          </div>
          <div className="sd-header-status">
            <span className={`sd-live-badge ${isConnected ? 'sd-live-on' : 'sd-live-off'}`}>
              <span className={`sd-live-dot ${isConnected ? 'sd-live-dot-on' : ''}`} />
              {isConnected ? 'Live' : 'Offline'}
            </span>
            {lastRefreshed && (
              <span className="sd-refresh-indicator" title="Auto-refreshes every 30s">
                <RefreshCw className="w-3 h-3" />
                {new Date(lastRefreshed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        </header>

        {/* ETA Hero Card — always full width */}
        <div className="sd-hero sd-card-animate" style={{ animationDelay: '0.06s' }}>
          <div className="sd-hero-glow" />
          <div className="sd-hero-content">
            {!tripId ? (
              <>
                <div className="sd-hero-badge-wrap">
                  <span className="sd-hero-badge sd-hero-badge-waiting">Waiting</span>
                </div>
                <p className="sd-hero-title sd-hero-title-muted">🚌 No Active Trip</p>
                <p className="sd-hero-subtitle">Waiting for driver to start the trip</p>
                <div className="sd-hero-info-box">
                  <p className="sd-hero-info-text">
                    Your bus will appear here once the driver begins the route
                  </p>
                </div>
              </>
            ) : stopDepartedInfo?.hasDeparted ? (
              <>
                {redirectInfo ? (
                  /* ── Redirected State ── */
                  <>
                    <div className="sd-hero-badge-wrap">
                      <span className="sd-hero-badge" style={{
                        background: redirectInfo.arrived ? 'rgba(34,197,94,0.25)' : 'rgba(99,102,241,0.25)',
                        color: redirectInfo.arrived ? '#86efac' : '#a5b4fc'
                      }}>
                        <ArrowRightLeft className="w-3.5 h-3.5" style={{ marginRight: 4 }} />
                        {redirectInfo.arrived ? 'Arrived!' : 'Redirected'}
                      </span>
                    </div>
                    <p className="sd-hero-title">
                      {redirectInfo.arrived ? '🎉 Bus Arrived at Your Stop!' : '🔄 Tracking Alternative Bus'}
                    </p>
                    <p className="sd-hero-subtitle">
                      {redirectInfo.arrived ? (
                        <>
                          <span className="sd-accent-text font-medium">{redirectInfo.redirectedBus?.name}</span> is at your stop
                        </>
                      ) : (
                        <>
                          Now tracking <span className="sd-accent-text font-medium">{redirectInfo.redirectedBus?.name}</span>
                          {redirectInfo.redirectedRoute?.name && !redirectInfo.sameRoute && (
                            <span className="text-slate-400"> ({redirectInfo.redirectedRoute.name})</span>
                          )}
                        </>
                      )}
                    </p>

                    <div className="sd-departed-grid" style={{ marginTop: '0.75rem' }}>
                      <div className="sd-departed-cell">
                        <p className="sd-departed-label">Bus</p>
                        <p className="sd-departed-value">{redirectInfo.redirectedBus?.numberPlate || '—'}</p>
                      </div>
                      <div className="sd-departed-cell">
                        <p className="sd-departed-label">ETA</p>
                        <p className="sd-departed-value" style={redirectInfo.arrived ? { color: '#86efac' } : {}}>
                          {redirectInfo.arrived ? 'Arrived!' : redirectInfo.etaMinutes ? `~${redirectInfo.etaMinutes} min` : '—'}
                        </p>
                      </div>
                      <div className="sd-departed-cell">
                        <p className="sd-departed-label">Stops Away</p>
                        <p className="sd-departed-value">{redirectInfo.stopsAway ?? '—'}</p>
                      </div>
                      <div className="sd-departed-cell">
                        <p className="sd-departed-label">Your Stop</p>
                        <p className="sd-departed-value">{redirectInfo.matchingStop?.name || stopInfo?.name || '—'}</p>
                      </div>
                    </div>

                    {redirectInfo.driver && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                        <span>👨‍✈️ {redirectInfo.driver.name}</span>
                        {redirectInfo.driver.phone && (
                          <a href={`tel:${redirectInfo.driver.phone}`} style={{ color: '#818cf8' }}>
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleCancelRedirect}
                      className="sd-btn-outline"
                      style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <XCircle className="w-4 h-4" />
                      Back to My Bus
                    </button>
                  </>
                ) : (
                  /* ── Normal Departed State ── */
                  <>
                    <div className="sd-hero-badge-wrap">
                      <span className="sd-hero-badge sd-hero-badge-departed">Departed</span>
                    </div>
                    <p className="sd-hero-title">🚌 Bus has departed</p>
                    <p className="sd-hero-subtitle">
                      from <span className="sd-accent-text font-medium">{stopDepartedInfo.stopName || stopInfo?.name}</span>
                    </p>
                    <div className="sd-departed-grid">
                      {stopDepartedInfo.arrivedAt && (
                        <div className="sd-departed-cell">
                          <p className="sd-departed-label">Arrived at</p>
                          <p className="sd-departed-value">
                            {new Date(stopDepartedInfo.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      {stopDepartedInfo.departedAt && (
                        <div className="sd-departed-cell">
                          <p className="sd-departed-label">Departed at</p>
                          <p className="sd-departed-value">
                            {new Date(stopDepartedInfo.departedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Missed Bus Button */}
                    <button
                      onClick={handleMissedBus}
                      disabled={redirectLoading}
                      style={{
                        marginTop: '0.75rem',
                        width: '100%',
                        padding: '0.65rem 1rem',
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#fbbf24',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: redirectLoading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s',
                      }}
                    >
                      {redirectLoading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Finding alternative...</>
                      ) : (
                        <><ArrowRightLeft className="w-4 h-4" /> I Missed My Bus — Find Another</>
                      )}
                    </button>
                    <p className="sd-hero-footer-note">📍 Bus is continuing on route — see map below</p>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="sd-hero-subtitle" style={{ marginBottom: '0.25rem' }}>Estimated Arrival</p>
                <p className="sd-eta-value">{formattedEta}</p>
                <p className="sd-hero-subtitle">
                  to <span className="sd-accent-text font-medium">{stopInfo?.name || 'your stop'}</span>
                </p>
                <div className="sd-progress-wrap">
                  <span className="sd-progress-label">Progress:</span>
                  <div className="sd-progress-track">
                    <div
                      className="sd-progress-bar"
                      style={{ width: `${journey?.progress?.percentage || 0}%` }}
                    />
                  </div>
                  <span className="sd-progress-pct">{journey?.progress?.percentage || 0}%</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Desktop 2-column grid: Map (left/main) + Sidebar (right) */}
        <div className="sd-grid-desktop">
          {/* Left — Map */}
          <div className="sd-col-main">
            <div className="sd-map-wrap sd-card-animate" style={{ animationDelay: '0.12s' }}>
              <div className="sd-map-inner">
                <StudentMap
                  busPosition={busPosition}
                  stopPosition={stopPosition}
                  routePath={journey?.routePath || null}
                />
              </div>
            </div>

            {/* Driver Info — below map on desktop */}
            {driverInfo && (
              <div className="sd-driver-card sd-card-animate" style={{ animationDelay: '0.16s' }}>
                <div className="sd-driver-avatar">
                  <span className="text-xl">👨‍✈️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="sd-driver-name">{driverInfo.name}</p>
                  <p className="sd-driver-role">Your Driver</p>
                </div>
                {driverInfo.phone && (
                  <a href={`tel:${driverInfo.phone}`} className="sd-driver-call">
                    <Phone className="w-5 h-5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Right — Stats + Actions + Events */}
          <div className="sd-col-side">
            {/* Stats Grid */}
            <div className="sd-stats-grid">
              <StatCard
                icon={Bus}
                label="Bus"
                value={profile?.bus?.name || 'N/A'}
                subtext={profile?.bus?.numberPlate}
              />
              <StatCard
                icon={Gauge}
                label="Speed"
                value={`${Math.round(busSpeed * 3.6)} km/h`}
                subtext="Real-time"
                highlight={busSpeed > 0}
              />
              <StatCard
                icon={MapPin}
                label="Your Stop"
                value={stopInfo?.name || 'Not assigned'}
                subtext={`Stop #${stopInfo?.seq || '—'}`}
              />
              <StatCard
                icon={Clock}
                label="Status"
                value={stopDepartedInfo?.hasDeparted ? 'Departed' : tripId ? 'Active' : 'Waiting'}
                subtext={stopDepartedInfo?.hasDeparted ? 'Bus passed your stop' : statusMessage}
                highlight={stopDepartedInfo?.hasDeparted}
              />
            </div>

            {/* Quick Actions */}
            <div className="sd-actions-grid">
              <QuickAction
                icon={RefreshCw}
                label="Refresh"
                onClick={fetchProfile}
              />
              <QuickAction
                icon={Volume2}
                label="Speak"
                onClick={speakStatus}
              />
              <QuickAction
                icon={notificationsEnabled ? Bell : BellOff}
                label={notificationsEnabled ? 'Alerts On' : 'Alerts Off'}
                onClick={notificationsEnabled ? disableNotifications : enableNotifications}
                variant={notificationsEnabled ? 'primary' : 'default'}
              />
              <QuickAction
                icon={Settings}
                label="Settings"
                onClick={() => setShowSettings(true)}
              />
            </div>

            {/* Recent Events */}
            <div className="sd-events-card sd-card-animate" style={{ animationDelay: '0.20s' }}>
              <div className="sd-events-header">
                <h2 className="sd-events-title">Recent Events</h2>
                <ChevronRight className="w-5 h-5 sd-muted-icon" />
              </div>
              <div className="sd-events-list">
                {historyEvents.length > 0 ? (
                  historyEvents.map((event, idx) => (
                    <EventItem key={`${event.timestamp}-${idx}`} event={event} />
                  ))
                ) : (
                  <p className="sd-empty-events">No events yet</p>
                )}
              </div>
            </div>

            {/* Notification Control Card */}
            <div className="sd-notif-card sd-card-animate" style={{ animationDelay: '0.24s' }}>
              <div className="sd-notif-header">
                <div className="sd-notif-icon-ring">
                  {notificationsEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                </div>
                <div className="sd-notif-info">
                  <h3 className="sd-notif-title">Push Notifications</h3>
                  <p className="sd-notif-desc">
                    {notificationsEnabled
                      ? 'You\'ll be alerted when your bus is nearby'
                      : 'Enable to get real-time bus approach alerts'}
                  </p>
                </div>
                <button
                  onClick={notificationsEnabled ? disableNotifications : enableNotifications}
                  className={`sd-notif-toggle ${notificationsEnabled ? 'sd-notif-toggle-on' : 'sd-notif-toggle-off'}`}
                >
                  <span className={`sd-notif-toggle-dot ${notificationsEnabled ? 'sd-notif-dot-on' : ''}`} />
                </button>
              </div>
              {notificationsEnabled && (
                <div className="sd-notif-actions">
                  <div className="sd-notif-status">
                    <span className="sd-notif-status-dot" />
                    <span className="sd-notif-status-text">Active &middot; Permission: {permission}</span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        toast('Sending test...');
                        await api.get('/notifications/test-push');
                        toast.success('Check your notifications!');
                      } catch (err) {
                        toast.error('Test failed');
                      }
                    }}
                    className="sd-notif-test-btn"
                  >
                    <Bell className="w-4 h-4" />
                    Send Test
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default StudentDashboard;

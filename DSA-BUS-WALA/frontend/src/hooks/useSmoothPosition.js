import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BoundedQueue from '../utils/BoundedQueue';
import { projectToPath, densifyPath } from '../utils/projectToPath';

/** Minimum animation duration (ms) when the bus is essentially stationary. */
const MIN_DURATION_MS = 1200;
/** Maximum animation duration (ms) for a large jump on a slow connection. */
const MAX_DURATION_MS = 2600;
/** A jump this large (≈700m) is treated as a teleport — snap, don't glide. */
const TELEPORT_THRESHOLD_DEG = 0.0065;
/** GPS jitter below this (≈8m) is ignored; keeps the marker from twitching. */
const JITTER_THRESHOLD_DEG = 0.00007;
/** Maximum number of pending position updates to buffer mid-glide. */
const QUEUE_CAPACITY = 8;
/** Densification step (deg ≈ 44m) so the marker slides along fine road detail. */
const DENSIFY_STEP_DEG = 0.0004;

// Cubic ease-in-out — smooth acceleration/deceleration for natural movement.
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Wrap degrees to [-180, 180] for clean shortest-path heading turns.
const wrapDeg = (deg) => {
  const normalized = ((deg + 180) % 360 + 360) % 360 - 180;
  return normalized;
};

/**
 * useSmoothPosition
 *
 * Receives raw live {lat, lng} updates and returns a smoothly interpolated
 * position that glides between them. Fixes the "jump backward" bug where a
 * new update landing mid-animation reset the start point to the *last received*
 * coordinate instead of the *currently displayed* coordinate.
 *
 * Rapid updates are buffered in a BoundedQueue (O(1) circular buffer) and
 * dequeued in FIFO order once the current glide reaches its pivot point, so
 * the marker never snaps backwards or thrashes under a burst of GPS/socket
 * events.
 *
 * Optionally accepts a `routePath` polyline ([lat,lng][]). When provided, the
 * interpolated position is projected onto the densified polyline each frame so
 * the marker visibly follows the road instead of cutting corners between GPS
 * samples. Heading is then derived from the road direction, giving a natural
 * bus orientation.
 *
 * @param {Object} options
 * @param {Object|null} options.livePosition   Raw target position {lat, lng}
 * @param {number}  options.durationMs         Base glide duration (default 900ms)
 * @param {boolean} options.enabled            Toggle interpolation (default true)
 * @param {boolean} options.queueUpdates       Buffer rapid updates instead of cancelling mid-glide (default true)
 * @param {Array<[number, number]>|null} options.routePath  Polyline [[lat,lng],...] to snap the marker onto
 * @param {number} options.staleAfterMs                     Time (ms) before a position is treated as stale
 * @returns {{ position:{lat,lng}|null, heading:number, isMoving:boolean, isStale:boolean }}
 */
const useSmoothPosition = ({
  livePosition,
  durationMs = 900,
  enabled = true,
  queueUpdates = true,
  routePath = null,
  staleAfterMs = 15000
}) => {
  const [displayPosition, setDisplayPosition] = useState(livePosition || null);
  const [heading, setHeading] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [isStale, setIsStale] = useState(false);

  // Animation state.
  const fromRef = useRef(livePosition || null);
  const toRef = useRef(livePosition || null);
  const startTimeRef = useRef(null);
  const currentDurationRef = useRef(durationMs);
  const rafRef = useRef(null);
  const prevLiveRef = useRef(livePosition || null);

  // Last received update timestamp + staleness references.
  const lastUpdateRef = useRef(
    livePosition?.timestamp ? new Date(livePosition.timestamp).getTime() : Date.now()
  );
  const staleTimerRef = useRef(null);

  // Smoothed heading — avoids marker spinning wildly on GPS noise.
  const headingRef = useRef(0);

  // Last *displayed* (post-projection) position — used to derive road heading.
  const lastDisplayedRef = useRef(null);

  // Bounded FIFO queue for pending positions that arrive mid-glide.
  const pendingQueueRef = useRef(new BoundedQueue(QUEUE_CAPACITY));
  const isAnimatingRef = useRef(false);

  // Densify the route once per change so per-frame projection is cheap.
  const densifiedRoute = useMemo(
    () => (routePath && routePath.length > 1 ? densifyPath(routePath, DENSIFY_STEP_DEG) : null),
    [routePath]
  );

  const computeHeading = useCallback((from, to) => {
    if (!from || !to) return 0;
    const dLat = to.lat - from.lat;
    const dLng = to.lng - from.lng;
    if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) return 0;
    const rad = Math.atan2(dLng, dLat);
    return (rad * 180) / Math.PI + 90;
  }, []);

  // Smooth heading by taking shortest path toward the target heading.
  const smoothToward = useCallback((current, target, factor = 0.25) => {
    const delta = wrapDeg(target - current);
    return current + delta * factor;
  }, []);

  /**
   * Core animation loop. Reads current from/to each frame so that if a new
   * update arrives mid-glide we can optionally re-pivot from the *displayed*
   * position (no backward jump) rather than the stale `from`.
   */
  const tick = useCallback(() => {
    // If a pending update is queued and we're near the end of the glide, pivot.
    if (queueUpdates && !pendingQueueRef.current.isEmpty() && isAnimatingRef.current) {
      const from = fromRef.current;
      const to = toRef.current;
      if (from && to) {
        const now = performance.now();
        const elapsed = now - startTimeRef.current || 1;
        const t = Math.min(1, elapsed / currentDurationRef.current);
        // If we're >80% done, pick up the queued point now.
        if (t > 0.8) {
          const next = pendingQueueRef.current.dequeue();
          // Pivot from the actual visual position (interpolated) — the crucial fix.
          const visualLat = from.lat + (to.lat - from.lat) * easeInOutCubic(t);
          const visualLng = from.lng + (to.lng - from.lng) * easeInOutCubic(t);
          startGlide({ lat: visualLat, lng: visualLng }, next, durationMs);
          return;
        }
      }
    }

    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to) {
      isAnimatingRef.current = false;
      setIsMoving(false);
      return;
    }

    const now = performance.now();
    const elapsed = now - startTimeRef.current;
    const t = Math.min(1, elapsed / currentDurationRef.current);
    const eased = easeInOutCubic(t);

    let lat = from.lat + (to.lat - from.lat) * eased;
    let lng = from.lng + (to.lng - from.lng) * eased;

    // Snap to the road (if a route is supplied) so the bus follows the path.
    if (densifiedRoute) {
      const projected = projectToPath(densifiedRoute, { lat, lng });
      if (projected) {
        lat = projected.lat;
        lng = projected.lng;
      }
    }

    // Derive heading from road movement when projecting, so the bus faces the road.
    if (densifiedRoute && lastDisplayedRef.current) {
      const roadHeading = computeHeading(lastDisplayedRef.current, { lat, lng });
      const nextHeading = smoothToward(headingRef.current || roadHeading, roadHeading, 0.35);
      headingRef.current = nextHeading;
      setHeading(nextHeading);
    }

    lastDisplayedRef.current = { lat, lng };
    setDisplayPosition({ lat, lng });

    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      isAnimatingRef.current = false;
      setIsMoving(false);
      // Snap to exact target.
      setDisplayPosition({ ...to });
      lastDisplayedRef.current = { ...to };
      // If more points are queued, continue to the next one.
      if (queueUpdates && !pendingQueueRef.current.isEmpty()) {
        const next = pendingQueueRef.current.dequeue();
        startGlide({ ...to }, next, durationMs);
      }
    }
  }, [computeHeading, densifiedRoute, durationMs, queueUpdates, smoothToward]);

  // Keep the latest tick available to startGlide without stale closures.
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  // Start (or restart) a glide toward `to` using `from` as the visible start.
  const startGlide = useCallback((from, to, baseDurationMs) => {
    if (!from || !to) return;

    // Estimate travel distance in degrees → pick an adaptive duration.
    const distDeg = Math.hypot(to.lat - from.lat, to.lng - from.lng);
    const base = typeof baseDurationMs === 'number' ? baseDurationMs : durationMs;

    // Scale duration proportionally to distance but clamp to sane bounds.
    let glideMs = base;
    if (distDeg > 0.00001) {
      // Assume a typical update covers ~30-60m; scale up for longer gaps.
      const scale = distDeg / 0.0004; // 0.0004 deg ≈ 44m
      glideMs = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, base * Math.min(2.4, scale + 1)));
    }

    currentDurationRef.current = glideMs;

    fromRef.current = from;
    toRef.current = to;
    startTimeRef.current = performance.now();
    isAnimatingRef.current = true;
    setIsMoving(true);

    // If we aren't road-projecting, smooth the heading toward the raw bearing.
    if (!densifiedRoute) {
      const targetHeading = computeHeading(from, to);
      const nextHeading = smoothToward(headingRef.current || targetHeading, targetHeading, 0.35);
      headingRef.current = nextHeading;
      setHeading(nextHeading);
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [computeHeading, densifiedRoute, durationMs, smoothToward]);

  // React to new live position updates.
  useEffect(() => {
    if (!enabled || !livePosition) return;

    const prev = prevLiveRef.current;

    // Track freshness: every fresh update resets the staleness timer.
    lastUpdateRef.current = livePosition?.timestamp
      ? new Date(livePosition.timestamp).getTime()
      : Date.now();
    setIsStale(false);
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(() => {
      setIsStale(true);
      // Pause interpolation: snap to the last known position and halt.
      isAnimatingRef.current = false;
      setIsMoving(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      pendingQueueRef.current.clear();
    }, staleAfterMs);

    // First position — just snap.
    if (!prev) {
      fromRef.current = livePosition;
      toRef.current = livePosition;
      setDisplayPosition({ ...livePosition });
      lastDisplayedRef.current = { ...livePosition };
      prevLiveRef.current = livePosition;
      return;
    }

    const dist = Math.hypot(livePosition.lat - prev.lat, livePosition.lng - prev.lng);

    // Teleport / trip-switch / huge gap — snap.
    if (dist > TELEPORT_THRESHOLD_DEG) {
      fromRef.current = livePosition;
      toRef.current = livePosition;
      setDisplayPosition({ ...livePosition });
      lastDisplayedRef.current = { ...livePosition };
      prevLiveRef.current = livePosition;
      isAnimatingRef.current = false;
      setIsMoving(false);
      pendingQueueRef.current.clear();
      return;
    }

    // GPS jitter — ignore micro-movements to stop marker twitching.
    if (dist < JITTER_THRESHOLD_DEG) {
      prevLiveRef.current = livePosition;
      return;
    }

    prevLiveRef.current = livePosition;

    if (queueUpdates && isAnimatingRef.current) {
      // Buffer the update; the animation loop will pivot to it when ready.
      pendingQueueRef.current.enqueue(livePosition);
      return;
    }

    // Normal glide — animate from the current *displayed* position.
    const visual = displayPosition || prev;
    startGlide(visual, livePosition, durationMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePosition, enabled, queueUpdates, startGlide, staleAfterMs]);

  // Cleanup.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, []);

  return { position: displayPosition, heading, isMoving, isStale };
};

export default useSmoothPosition;

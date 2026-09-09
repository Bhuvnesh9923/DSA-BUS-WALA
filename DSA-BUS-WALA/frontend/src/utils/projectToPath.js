/**
 * projectToPath
 *
 * Projects a point onto a polyline (array of [lat, lng]) and returns the
 * nearest point on the path. This keeps a moving marker visually "on the road"
 * instead of cutting corners between GPS samples.
 *
 * Approach: iterate each segment once (O(n)), compute the perpendicular
 * projection parameter `t` clamped to [0,1], and track the closest candidate.
 * Kept dependency-free for performance; path lengths here are small (a route
 * is a few hundred points at most).
 */

/**
 * @param {Array<[number, number]>|null} path Polyline as [[lat, lng], ...]
 * @param {{ lat: number, lng: number }} point The point to project
 * @returns {{ lat: number, lng: number }|null} Nearest point on the path
 */
export const projectToPath = (path, point) => {
  if (!path || path.length < 2 || !point) return point || null;

  const px = point.lat;
  const py = point.lng;

  let bestDistSq = Infinity;
  let bestLat = point.lat;
  let bestLng = point.lng;

  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    // Degenerate segment — treat as a point.
    if (lenSq === 0) {
      const dLat = px - ax;
      const dLng = py - ay;
      const dSq = dLat * dLat + dLng * dLng;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestLat = ax;
        bestLng = ay;
      }
      continue;
    }

    // Projection parameter t along segment [a, b].
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx;
    const cy = ay + t * dy;

    const dLat = px - cx;
    const dLng = py - cy;
    const dSq = dLat * dLat + dLng * dLng;

    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestLat = cx;
      bestLng = cy;
    }
  }

  return { lat: bestLat, lng: bestLng };
};

/**
 * Densify a polyline by inserting interpolated intermediate points so that a
 * moving marker follows the road smoothly even with sparse GPS updates.
 *
 * @param {Array<[number, number]>} path
 * @param {number} maxStepDeg Maximum spacing (deg) between inserted points.
 * @returns {Array<[number, number]>} Densified path
 */
export const densifyPath = (path, maxStepDeg = 0.0004) => {
  if (!path || path.length < 2) return path || [];
  const result = [];

  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    result.push([ax, ay]);

    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(dist / maxStepDeg));
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      result.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
  }

  if (path.length > 0) result.push(path[path.length - 1]);
  return result;
};

export default { projectToPath, densifyPath };

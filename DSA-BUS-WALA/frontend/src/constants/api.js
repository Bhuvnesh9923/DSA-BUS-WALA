// Backend URL is set in .env (VITE_BACKEND_URL)
// For local dev: leave it empty or comment it out → auto-detects localhost / LAN
// For production (Vercel): set to your Render backend URL

/**
 * Detect if we're running inside a Capacitor native (Android) WebView.
 * Capacitor exposes the native bridge as `window.Capacitor`.
 */
const isCapacitorNative = () =>
  typeof window !== 'undefined' &&
  typeof window.Capacitor !== 'undefined' &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform();

const inferApiBaseUrl = () => {
  // 1. Explicit env var — used in production (Vercel) and when set in .env
  const envUrl = import.meta.env?.VITE_BACKEND_URL;

  if (typeof window !== 'undefined') {
    // Capacitor native (Android) — the WebView hostname is always `localhost`,
    // so localhost detection would wrongly pick http://localhost:5000.
    // On a device/emulator we must use VITE_BACKEND_URL (or a reachable IP).
    if (isCapacitorNative()) {
      if (envUrl) return envUrl.replace(/\/+$/, '');
      // Android emulator reaches the host machine via 10.0.2.2.
      return 'http://10.0.2.2:5000';
    }

    const { protocol, hostname, port } = window.location;
    const parsedPort = port ? Number(port) : null;
    const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
    const isLanHost = hostname?.startsWith('192.168.') || hostname?.startsWith('10.') || hostname?.endsWith('.local');

    // 2. Local development — use localhost backend
    if (isLocalHost) {
      return 'http://localhost:5000';
    }

    // 3. LAN access (mobile testing) — same host, backend port
    if (isLanHost || parsedPort === 5173) {
      return `${protocol}//${hostname}:5000`;
    }
  }

  // 4. Production / deployed — use env var (must be set in Vercel dashboard)
  if (envUrl) {
    return envUrl.replace(/\/+$/, ''); // strip trailing slash
  }

  console.warn('[TrackMate] VITE_BACKEND_URL not set — falling back to relative URL');
  return '';
};

export const API_BASE_URL = inferApiBaseUrl();
export const API_ROOT = `${API_BASE_URL}/api`;

if (typeof window !== 'undefined') {
  console.info('[TrackMate] API server:', API_BASE_URL || '(same origin)');
}

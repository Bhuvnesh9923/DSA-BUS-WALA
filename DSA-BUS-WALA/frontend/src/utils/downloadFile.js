/**
 * downloadFile — Cross-platform (Web + Capacitor/Android) file download.
 *
 * Uses the shared `api` axios instance so the Authorization header (Bearer
 * token) is attached automatically — no token-in-query needed. This is
 * important because `window.open(url?token=...)` does not work reliably inside
 * a Capacitor WebView on Android.
 *
 * @param {string} url   Relative API path, e.g. '/admin/export-trips?days=30'
 * @param {string} fallbackFilename  Suggested filename if the server omits it
 */
import { api } from './api';

const stripContentDisposition = (filename) =>
  filename?.replace(/^attachment;\s*filename="?/i, '').replace(/"?$/, '').trim();

const saveBlob = (blob, filename) => {
  // Capacitor native (Android): use the Filesystem/Share bridge if available.
  if (
    typeof window !== 'undefined' &&
    typeof window.Capacitor !== 'undefined' &&
    window.Capacitor.isNativePlatform?.()
  ) {
    const { Filesystem, Share } = window.Capacitor.Plugins;
    if (Filesystem) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const path = `${(await Filesystem.getDirectory?.())?.path || ''}${filename}`;
        try {
          const writeResult = await Filesystem.writeFile({ path, data: base64, directory: 'DOCUMENTS' });
          await Share?.share({ url: writeResult.uri, title: filename });
        } catch (fsErr) {
          console.error('[TrackMate] Filesystem write failed:', fsErr);
        }
      };
      reader.readAsDataURL(blob);
      return;
    }
  }

  // Web fallback.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Download a file from a protected API endpoint.
 * @param {string} url
 * @param {string} fallbackFilename
 */
const downloadFile = async (url, fallbackFilename = 'download') => {
  const res = await api.get(url, { responseType: 'blob' });

  const disposition = res.headers?.['content-disposition'] || '';
  const matched = /filename="?([^";]+)"?/.exec(disposition);
  const filename = matched?.[1] ? stripContentDisposition(matched[1]) : fallbackFilename;

  saveBlob(res.data, filename);
  return filename;
};

export default downloadFile;

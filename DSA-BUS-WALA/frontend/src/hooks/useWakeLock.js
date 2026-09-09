import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useWakeLock – Keeps the screen ON while the driver is actively streaming.
 *
 * Uses the Screen Wake Lock API (Chrome Android 84+, Safari 16.4+, Edge).
 * Automatically re-acquires the lock when the tab regains visibility
 * (e.g. user switches back from another app).
 *
 * Falls back to a tiny transparent <video> loop ("NoSleep" trick)
 * for browsers that don't support the Wake Lock API.
 */
const useWakeLock = () => {
    const [isActive, setIsActive] = useState(false);
    const wakeLockRef = useRef(null);
    const videoRef = useRef(null);
    const shouldBeActive = useRef(false);

    // Determine if the Wake Lock API is available
    const isWakeLockSupported = 'wakeLock' in navigator;

    const acquireWakeLock = useCallback(async () => {
        if (!shouldBeActive.current) return;

        // --- Native Wake Lock API ---
        if (isWakeLockSupported) {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                setIsActive(true);

                wakeLockRef.current.addEventListener('release', () => {
                    setIsActive(false);
                });
            } catch (err) {
                // Wake Lock request can fail if:
                // - battery saver is on
                // - tab is not visible
                console.warn('[WakeLock] Native request failed, trying video fallback:', err.message);
                startVideoFallback();
            }
            return;
        }

        // --- Video fallback for unsupported browsers ---
        startVideoFallback();
    }, [isWakeLockSupported]);

    const startVideoFallback = () => {
        if (videoRef.current) return; // already running

        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.style.position = 'fixed';
        video.style.top = '-1px';
        video.style.left = '-1px';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0.01';

        // Minimal valid MP4 (silent, 1-frame) encoded as data URI
        // This is the smallest possible valid MP4 that plays on mobile browsers
        video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA1m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAYdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAABtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAACgAAAAAAAAhVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAA';

        video.loop = true;
        video.muted = true;
        document.body.appendChild(video);

        video.play().then(() => {
            videoRef.current = video;
            setIsActive(true);
        }).catch((err) => {
            console.warn('[WakeLock] Video fallback failed:', err.message);
            video.remove();
        });
    };

    const stopVideoFallback = () => {
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.remove();
            videoRef.current = null;
        }
    };

    const requestWakeLock = useCallback(() => {
        shouldBeActive.current = true;
        acquireWakeLock();
    }, [acquireWakeLock]);

    const releaseWakeLock = useCallback(() => {
        shouldBeActive.current = false;

        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => { });
            wakeLockRef.current = null;
        }

        stopVideoFallback();
        setIsActive(false);
    }, []);

    // Re-acquire wake lock when tab becomes visible again
    // (lock is auto-released when tab goes to background on mobile)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && shouldBeActive.current) {
                acquireWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // Cleanup on unmount
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => { });
            }
            stopVideoFallback();
        };
    }, [acquireWakeLock]);

    return { isWakeLockActive: isActive, requestWakeLock, releaseWakeLock };
};

export default useWakeLock;

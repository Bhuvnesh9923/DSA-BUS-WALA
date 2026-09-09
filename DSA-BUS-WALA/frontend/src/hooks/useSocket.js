import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import offlineBuffer from '../utils/offlineBuffer';
import { API_BASE_URL } from '../constants/api';

const SOCKET_URL = API_BASE_URL;
const TOKEN_KEY = 'tm_token';
const MIN_UPDATE_INTERVAL_MS = Number(import.meta.env.VITE_MIN_UPDATE_INTERVAL_MS) || 1000;
const FLUSH_DELAY_MS = Math.min(500, MIN_UPDATE_INTERVAL_MS);
const MAX_RETRIES = 3;

let socketInstance = null;
let lastEmitTs = 0;
let retryTimeoutId = null;

const getSocket = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket']
    });
  }
  return socketInstance;
};

export const refreshSocketAuth = () => {
  const socket = getSocket();
  if (!socket) return;

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    socket.disconnect();
    return;
  }

  const emitAuth = () => {
    socket.emit('auth:token', { token });
    flushBuffer();
  };

  if (socket.connected) {
    emitAuth();
  } else {
    socket.connect();
    socket.once('connect', emitAuth);
  }
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
  }
};

const flushBuffer = () => {
  const socket = getSocket();
  if (!socket || !socket.connected) return 0;
  const pending = offlineBuffer.drain();
  if (!pending.length) return 0;

  pending.forEach((point, index) => {
    setTimeout(() => {
      emitLocation(point, { retry: false });
    }, index * FLUSH_DELAY_MS);
  });
  return pending.length;
};

const emitLocation = (payload, { retry = true } = {}) => {
  const socket = getSocket();
  if (!socket || !payload) {
    if (payload) offlineBuffer.push(payload);
    return false;
  }

  if (!socket.connected) {
    offlineBuffer.push(payload);
    return false;
  }

  try {
    socket.emit('driver:location_update', payload);
    lastEmitTs = Date.now();
    return true;
  } catch (error) {
    if (retry) {
      // Cancel any previous retry chain before starting a new one
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      let attempt = 0;
      const scheduleRetry = () => {
        attempt += 1;
        if (attempt > MAX_RETRIES) {
          offlineBuffer.push(payload);
          return;
        }
        const delay = Math.min(FLUSH_DELAY_MS * 2 ** attempt, 2000);
        retryTimeoutId = setTimeout(() => {
          const sent = emitLocation(payload, { retry: false });
          if (!sent) scheduleRetry();
        }, delay);
      };
      scheduleRetry();
    } else {
      offlineBuffer.push(payload);
    }
    return false;
  }
};

export const useSocket = (handlers = {}) => {
  const [isConnected, setIsConnected] = useState(socketInstance?.connected ?? false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bufferSize, setBufferSize] = useState(offlineBuffer.size());

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const handleConnect = () => {
      setIsConnected(true);
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        socket.emit('auth:token', { token });
      }
      const flushed = flushBuffer();
      if (flushed) {
        setBufferSize(offlineBuffer.size());
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsAuthenticated(false);
      setBufferSize(offlineBuffer.size());
    };

    const handleAuthReady = () => {
      setIsAuthenticated(true);
    };

    // Handle reconnection - re-authenticate when socket reconnects
    const handleReconnect = () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        socket.emit('auth:token', { token });
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('auth:ready', handleAuthReady);
    socket.io.on('reconnect', handleReconnect);

    if (!socket.connected) {
      socket.connect();
    } else {
      if (socket.connected) handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('auth:ready', handleAuthReady);
      socket.io.off('reconnect', handleReconnect);
    };
  }, []);

  // Store handlers in a ref to avoid re-subscribing on every render
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    // Create stable wrapper functions that delegate to the latest handler ref
    const wrappers = {};
    Object.entries(handlersRef.current).forEach(([event, callback]) => {
      if (typeof callback === 'function') {
        wrappers[event] = (...args) => handlersRef.current[event]?.(...args);
        socket.on(event, wrappers[event]);
      }
    });

    return () => {
      Object.entries(wrappers).forEach(([event, wrapper]) => {
        socket.off(event, wrapper);
      });
    };
  }, []); // subscribe once — handlers are read from ref

  return useMemo(
    () => ({
      socket: socketInstance,
      isConnected,
      isAuthenticated,
      bufferSize,
      lastEmitTs,
      emitLocation: (payload) => {
        const success = emitLocation(payload);
        setBufferSize(offlineBuffer.size());
        return success;
      }
    }),
    [bufferSize, isConnected, isAuthenticated]
  );
};

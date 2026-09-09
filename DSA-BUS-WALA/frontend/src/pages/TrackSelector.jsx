import { useEffect, useState } from 'react';

import { API_ROOT } from '../constants/api';

const TrackSelector = () => {
    const [buses, setBuses] = useState([]);
    const [selected, setSelected] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_ROOT}/public/buses`)
            .then(r => r.json())
            .then(data => {
                console.log('[TrackSelector] buses:', data);
                setBuses(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch((err) => { console.error('[TrackSelector] fetch error:', err); setLoading(false); });
    }, []);

    const handleTrack = () => {
        if (!selected) return;
        const slug = selected.replace(/\s+/g, '');
        window.open(`/track/${slug}`, '_blank');
    };

    const selectedBus = buses.find(b => b.name === selected);

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <img src="/favicons/android-chrome-192x192.png" alt="TrackMate" style={styles.logo} />
                <h1 style={styles.title}>TrackMate</h1>
                <p style={styles.subtitle}>Real-Time Bus Tracking</p>

                <div style={styles.form}>
                    <label style={styles.label}>Select a Bus</label>
                    <select
                        value={selected}
                        onChange={e => setSelected(e.target.value)}
                        style={styles.select}
                        disabled={loading}
                    >
                        <option value="">{loading ? 'Loading buses...' : '— Choose a bus —'}</option>
                        {buses.map(b => (
                            <option key={b._id} value={b.name}>
                                {b.name} ({b.numberPlate}){b.active ? ' 🟢' : ''}
                            </option>
                        ))}
                    </select>

                    {selectedBus && (
                        <div style={styles.info}>
                            <span style={styles.plate}>{selectedBus.numberPlate}</span>
                            <span style={{
                                ...styles.status,
                                background: selectedBus.active ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                                color: selectedBus.active ? '#4ade80' : '#94a3b8'
                            }}>
                                {selectedBus.active ? '● Running' : '○ Not Active'}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={handleTrack}
                        disabled={!selected}
                        style={{
                            ...styles.btn,
                            opacity: selected ? 1 : 0.5,
                            cursor: selected ? 'pointer' : 'not-allowed'
                        }}
                    >
                        🚌 Track Bus
                    </button>
                </div>

                <p style={styles.hint}>
                    Or go directly: <code style={styles.code}>/track/BusName</code>
                </p>
            </div>
        </div>
    );
};

const styles = {
    page: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    card: {
        background: 'rgba(30,41,59,0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '1.25rem',
        padding: '2.5rem 2rem',
        maxWidth: 420,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
    },
    logo: { width: 56, height: 56, borderRadius: 12, marginBottom: '0.75rem' },
    title: { fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', margin: '0 0 0.25rem' },
    subtitle: { fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 2rem', letterSpacing: '0.03em' },
    form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
    label: { fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' },
    select: {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '0.75rem',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(15,23,42,0.8)',
        color: '#e2e8f0',
        fontSize: '0.95rem',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'auto'
    },
    info: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0.75rem',
        background: 'rgba(15,23,42,0.5)',
        borderRadius: '0.5rem'
    },
    plate: { fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', letterSpacing: '0.04em' },
    status: { fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '0.4rem' },
    btn: {
        marginTop: '0.5rem',
        padding: '0.85rem',
        borderRadius: '0.75rem',
        border: 'none',
        background: 'linear-gradient(135deg, #ff6b2c, #ff4500)',
        color: '#fff',
        fontSize: '1rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        transition: 'transform 0.15s, box-shadow 0.15s',
        boxShadow: '0 4px 15px rgba(255,107,44,0.3)'
    },
    hint: { marginTop: '1.5rem', fontSize: '0.75rem', color: '#64748b' },
    code: {
        background: 'rgba(255,255,255,0.06)',
        padding: '0.15rem 0.4rem',
        borderRadius: '0.25rem',
        fontSize: '0.75rem',
        color: '#94a3b8'
    }
};

export default TrackSelector;

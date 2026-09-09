import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import './SeatMap.css';

/**
 * SeatMap
 *
 * Renders a 2D bus seat layout from a `seatMap` grid (`seatMap[row][col]`).
 * - Free seat   → orange/white, clickable
 * - My seat     → emerald, labelled "You"
 * - Taken seat  → greyed out
 *
 * Props:
 * @param {string} busId          Bus ObjectId to load/book seats on
 * @param {function} [onBooked]   Callback after a successful booking (updates parent state)
 */
const SeatMap = ({ busId, onBooked }) => {
  const [seatData, setSeatData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState(null);
  const [error, setError] = useState(null);

  const userId = useMemo(() => {
    try {
      const raw = localStorage.getItem('tm_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?._id || parsed?.id;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const fetchSeats = async () => {
    if (!busId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/students/buses/${busId}/seats`);
      setSeatData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load seats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busId]);

  const isMine = (seat) =>
    seat?.occupiedBy && seat.occupiedBy.toString() === userId;

  const handleBook = async (seatId) => {
    setBookingId(seatId);
    try {
      const { data } = await api.post(`/students/buses/${busId}/seats/book`, { seatId });
      setSeatData({ ...seatData, seatMap: data.seatMap, myBooking: data.myBooking || null });
      toast.success(data.message || 'Seat booked!', { icon: '💺' });
      onBooked?.(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to book seat');
      fetchSeats();
    } finally {
      setBookingId(null);
    }
  };

  const handleRelease = async () => {
    try {
      const { data } = await api.post(`/students/buses/${busId}/seats/release`);
      setSeatData({ ...seatData, seatMap: data.seatMap, myBooking: null });
      toast('Seat released', { icon: '💺' });
      onBooked?.({ released: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to release seat');
    }
  };

  if (!busId) return null;

  if (loading) {
    return (
      <div className="seatmap-state">
        <div className="seatmap-spinner" />
        <p className="seatmap-state-text">Loading seats…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="seatmap-state seatmap-error">
        <p className="seatmap-state-text">{error}</p>
      </div>
    );
  }

  const busSeatMap = seatData?.seatMap || [];

  // Header: capacity + my booking
  const total = seatData?.totalSeats || 0;
  const taken = busSeatMap.flat().filter((s) => s.occupiedBy).length;

  return (
    <div className="seatmap-wrap">
      <div className="seatmap-header">
        <div>
          <p className="seatmap-title">Choose Your Seat</p>
          <p className="seatmap-subtitle">
            {taken}/{total} booked
          </p>
        </div>
        {seatData?.myBooking && (
          <button onClick={handleRelease} className="seatmap-release-btn">
            Release Seat
          </button>
        )}
      </div>

      <div className="seatmap-grid">
        {busSeatMap.map((row, r) => (
          <div className="seatmap-row" key={`row-${r}`}>
            {row.map((seat, c) => {
              const mine = isMine(seat);
              const takenByOther = seat?.occupiedBy && !mine;
              const seatId = seat?.seatId || `${r}-${c}`;

              return (
                <button
                  type="button"
                  key={seatId}
                  className={`seatmap-seat ${mine ? 'seatmap-seat-mine' : ''} ${takenByOther ? 'seatmap-seat-taken' : ''}`}
                  disabled={takenByOther || bookingId === seatId}
                  onClick={() => !takenByOther && handleBook(seatId)}
                  title={mine ? `Your seat ${seatId}` : takenByOther ? `Taken (${seatId})` : `Book ${seatId}`}
                >
                  {mine ? (
                    <span className="seatmap-owner-badge">You</span>
                  ) : (
                    <span className="seatmap-seat-id">{seatId}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="seatmap-legend">
        <span className="seatmap-legend-item">
          <span className="seatmap-swatch seatmap-swatch-free" /> Free
        </span>
        <span className="seatmap-legend-item">
          <span className="seatmap-swatch seatmap-swatch-mine" /> You
        </span>
        <span className="seatmap-legend-item">
          <span className="seatmap-swatch seatmap-swatch-taken" /> Taken
        </span>
      </div>
    </div>
  );
};

export default SeatMap;

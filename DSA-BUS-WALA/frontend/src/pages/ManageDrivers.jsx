import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import Drawer from '../components/Drawer';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  UserCheck, Plus, Search, Edit2, Trash2, Phone,
  User, X, Bus, Shield, Filter, ChevronDown, CheckSquare, Square, MousePointerClick
} from 'lucide-react';
import TrackMateLoader from '../components/TrackMateLoader';

const blankForm = { username: '', password: '', name: '', phone: '' };

/* Stat Card Component */
const StatCard = ({ icon: Icon, label, value, subtitle, color = 'orange' }) => {
  const colors = {
    orange: 'from-orange-500 to-orange-600',
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600'
  };

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

/* Driver Card Component */
const DriverCard = ({ driver, buses, onEdit, onDelete, selectionMode, isSelected, onToggleSelect }) => {
  const isAssigned = Boolean(driver.assignedBusId);
  const assignedBus = isAssigned ? buses.find(b => b._id === driver.assignedBusId || b.driver === driver._id) : null;

  const handleCardClick = () => {
    if (selectionMode) onToggleSelect(driver._id);
  };

  return (
    <div
      className={`relative bg-white rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden ${
        isSelected
          ? 'border-orange-400 ring-2 ring-orange-200 shadow-lg shadow-orange-100'
          : 'border-gray-200 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-50 hover:-translate-y-0.5'
      }`}
      onClick={handleCardClick}
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${isAssigned ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-orange-400 to-amber-400'}`} />

      <div className="p-5">
        {/* Header: avatar + name + badge */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {selectionMode && (
              <div className="flex-shrink-0">
                {isSelected
                  ? <CheckSquare className="w-5 h-5 text-orange-500" />
                  : <Square className="w-5 h-5 text-gray-300" />
                }
              </div>
            )}
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
              isAssigned
                ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-200'
                : 'bg-gradient-to-br from-gray-50 to-gray-100 ring-1 ring-gray-200'
            }`}>
              <User className={`w-5 h-5 ${isAssigned ? 'text-emerald-600' : 'text-gray-400'}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-gray-900 font-semibold truncate text-[0.95rem] leading-tight">{driver.name || 'Unnamed'}</h3>
              <p className="text-xs text-gray-400 mt-0.5">@{driver.username}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0 ${
            isAssigned
              ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60'
              : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isAssigned ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isAssigned ? 'Assigned' : 'Available'}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-2.5 mb-4 pl-0.5">
          <div className="flex items-center gap-2.5 text-sm">
            <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <span className="text-gray-600">{driver.phone || 'No phone'}</span>
          </div>
          {isAssigned && (
            <div className="flex items-center gap-2.5 text-sm">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                <Bus className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <span className="text-gray-700 font-medium">{assignedBus?.name || 'Bus assigned'}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {!selectionMode && (
          <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-gray-100">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(driver); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 transition"
              title="Edit driver"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(driver); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition"
              title="Delete driver"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ManageDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [busFilter, setBusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(blankForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [confirmState, setConfirmState] = useState({ open: false, target: null });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const [driversRes, busesRes] = await Promise.all([
        api.get('/admin/drivers'),
        api.get('/buses')
      ]);
      setDrivers(driversRes.data);
      setBuses(busesRes.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to load drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  const openCreate = () => {
    setEditingDriver(null);
    setForm(blankForm);
    setDrawerOpen(true);
  };

  const openEdit = (driver) => {
    setEditingDriver(driver);
    setForm({ username: driver.username, password: '', name: driver.name || '', phone: driver.phone || '' });
    setDrawerOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      username: form.username,
      name: form.name,
      phone: form.phone
    };
    if (!editingDriver || form.password.trim()) {
      payload.password = form.password.trim() || form.username;
    }

    try {
      if (editingDriver) {
        await api.put(`/ admin / drivers / ${editingDriver._id} `, payload);
        toast.success('Driver updated');
      } else {
        await api.post('/admin/drivers', payload);
        toast.success('Driver created');
      }
      setDrawerOpen(false);
      setForm(blankForm);
      setEditingDriver(null);
      loadDrivers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save driver');
    }
  };

  const askDelete = (driver) => setConfirmState({ open: true, target: driver });

  const confirmDelete = async () => {
    if (!confirmState.target) return;
    try {
      await api.delete(`/admin/drivers/${confirmState.target._id}`);
      toast.success('Driver removed');
      setConfirmState({ open: false, target: null });
      loadDrivers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to delete driver');
    }
  };

  // === Multi-Select Handlers ===
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredDrivers.map(d => d._id)));
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    setBulkConfirm(false);
    let deleted = 0;
    for (const id of ids) {
      try {
        await api.delete(`/admin/drivers/${id}`);
        deleted++;
      } catch { /* skip failures */ }
    }
    toast.success(`${deleted} driver${deleted !== 1 ? 's' : ''} deleted`);
    exitSelection();
    loadDrivers();
  };

  const filteredDrivers = useMemo(() => {
    let result = drivers;

    // Text search
    const needle = search.trim().toLowerCase();
    if (needle) {
      result = result.filter((driver) =>
        [driver.username, driver.name, driver.phone].some((value) => value?.toLowerCase().includes(needle))
      );
    }

    // Bus filter
    if (busFilter) {
      result = result.filter((driver) => driver.assignedBusId === busFilter);
    }

    // Status filter
    if (statusFilter === 'assigned') {
      result = result.filter((driver) => Boolean(driver.assignedBusId));
    } else if (statusFilter === 'available') {
      result = result.filter((driver) => !driver.assignedBusId);
    }

    return result;
  }, [drivers, search, busFilter, statusFilter]);

  const assignedDrivers = drivers.filter((driver) => driver.assignedBusId).length;

  const hasActiveFilters = search || busFilter || statusFilter;
  const clearFilters = () => {
    setSearch('');
    setBusFilter('');
    setStatusFilter('');
  };

  return (
    <main className="min-h-screen pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Driver Management</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your fleet drivers</p>
          </div>
          <div className="flex gap-2 sm:w-auto w-full">
            <button
              onClick={() => { if (selectionMode) exitSelection(); else setSelectionMode(true); }}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border font-medium transition sm:w-auto ${selectionMode
                ? 'border-orange-500 text-orange-500 bg-orange-50'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                }`}
            >
              <MousePointerClick className="w-5 h-5" />
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
            {!selectionMode && (
              <button
                onClick={openCreate}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition sm:w-auto flex-1"
              >
                <Plus className="w-5 h-5" />
                Add Driver
              </button>
            )}
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={UserCheck} label="Total Drivers" value={drivers.length} subtitle="Registered" color="orange" />
          <StatCard icon={Bus} label="Assigned" value={assignedDrivers} subtitle="To buses" color="emerald" />
          <StatCard icon={Shield} label="Available" value={drivers.length - assignedDrivers} subtitle="Unassigned" color="amber" />
        </div>

        {/* Filters */}
        <div className="card p-4 space-y-3">
          {/* Row 1: Search + Dropdowns */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, username, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500/50"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Bus Filter */}
            <div className="relative sm:w-48">
              <Bus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={busFilter}
                onChange={(e) => setBusFilter(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer"
              >
                <option value="">All Buses</option>
                {buses.map((bus) => (
                  <option key={bus._id} value={bus._id}>
                    {bus.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Status Filter */}
            <div className="relative sm:w-44">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="assigned">Assigned</option>
                <option value="available">Available</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Row 2: Active Filters + Result Count */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-gray-400 hover:text-gray-700 transition flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-3 h-3" />
                  Clear all
                </button>
              )}
              {search && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-600 text-xs">
                  Search: "{search.length > 15 ? search.slice(0, 15) + '…' : search}"
                  <button onClick={() => setSearch('')} className="ml-0.5 hover:text-orange-800"><X className="w-3 h-3" /></button>
                </span>
              )}
              {busFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-600 text-xs">
                  Bus: {buses.find(b => b._id === busFilter)?.name || 'Unknown'}
                  <button onClick={() => setBusFilter('')} className="ml-0.5 hover:text-orange-800"><X className="w-3 h-3" /></button>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-600 text-xs">
                  {statusFilter === 'assigned' ? '✓ Assigned' : '⭐ Available'}
                  <button onClick={() => setStatusFilter('')} className="ml-0.5 hover:text-orange-800"><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 flex-shrink-0">
              {filteredDrivers.length} of {drivers.length} driver{drivers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Drivers Grid */}
        {loading ? (
          <TrackMateLoader compact message="Loading drivers..." />
        ) : filteredDrivers.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDrivers.map((driver) => (
              <DriverCard
                key={driver._id}
                driver={driver}
                buses={buses}
                onEdit={openEdit}
                onDelete={askDelete}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(driver._id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center">
            <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No drivers found</p>
            <p className="text-sm text-gray-400 mt-1">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Add your first driver to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Drawer */}
      <Drawer
        isOpen={drawerOpen}
        title={editingDriver ? 'Edit Driver' : 'Add New Driver'}
        subtitle="Driver credentials for the mobile app"
        onClose={() => setDrawerOpen(false)}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="driver-form"
              className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition"
            >
              {editingDriver ? 'Save Changes' : 'Add Driver'}
            </button>
          </div>
        }
      >
        <form id="driver-form" className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block">Username</label>
            <input
              name="username"
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500/50"
              placeholder="e.g., driver1"
              required
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block">Password</label>
            <input
              name="password"
              type="text"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500/50"
              placeholder={editingDriver ? 'Leave blank to keep current' : 'Required'}
              required={!editingDriver}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block">Full Name</label>
            <input
              name="name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500/50"
              placeholder="e.g., John Smith"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block">Phone Number</label>
            <input
              name="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500/50"
              placeholder="e.g., +1 234 567 8900"
            />
          </div>
        </form>
      </Drawer>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title="Remove Driver"
        message={`Are you sure you want to remove ${confirmState.target?.name || confirmState.target?.username}?`}
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmState({ open: false, target: null })}
      />

      {/* Floating Selection Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 border border-gray-200 backdrop-blur-lg rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-fade-in">
          <p className="text-sm text-gray-900 font-medium whitespace-nowrap">
            {selectedIds.size} selected
          </p>
          <div className="w-px h-6 bg-gray-200" />
          <button
            onClick={selectAll}
            className="text-xs text-orange-500 hover:text-orange-600 font-medium whitespace-nowrap"
          >
            Select all ({filteredDrivers.length})
          </button>
          <button
            onClick={exitSelection}
            className="text-xs text-gray-400 hover:text-gray-700 font-medium whitespace-nowrap"
          >
            Deselect
          </button>
          <div className="w-px h-6 bg-gray-200" />
          <button
            onClick={() => setBulkConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 font-medium text-sm transition"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        open={bulkConfirm}
        title="Delete Selected Drivers"
        message={`Are you sure you want to delete ${selectedIds.size} selected driver${selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel="Delete All"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkConfirm(false)}
      />
    </main>
  );
};

export default ManageDrivers;

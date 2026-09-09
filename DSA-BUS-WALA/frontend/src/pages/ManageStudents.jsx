import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import { api } from '../utils/api';
import Drawer from '../components/Drawer';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Users, Plus, Search, Edit2, Trash2, Phone,
  User, X, Bus, MapPin, CheckCircle, Clock, Upload, FileSpreadsheet, AlertTriangle, Loader2, Filter, ChevronDown, Route, CheckSquare, Square, MousePointerClick
} from 'lucide-react';
import TrackMateLoader from '../components/TrackMateLoader';

const blankForm = { username: '', name: '', phone: '', email: '', busId: '', stopId: '' };

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
          <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

/* Student Card Component */
const StudentCard = ({ student, assignment, onEdit, onDelete, selectionMode, isSelected, onToggleSelect }) => {
  const isAssigned = Boolean(assignment);

  const handleCardClick = () => {
    if (selectionMode) onToggleSelect(student._id);
  };

  return (
    <div
      className={`card p-4 transition-all group cursor-pointer ${isSelected ? 'border-orange-500 bg-orange-500/5 ring-1 ring-orange-500/30'
        : 'hover:border-orange-500/30'
        }`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {selectionMode && (
            <div className="flex-shrink-0">
              {isSelected
                ? <CheckSquare className="w-5 h-5 text-orange-400" />
                : <Square className="w-5 h-5 text-slate-500" />
              }
            </div>
          )}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isAssigned ? 'bg-emerald-500/20' : 'bg-amber-500/20'
            }`}>
            <User className={`w-5 h-5 ${isAssigned ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-semibold truncate">{student.name || 'Unnamed'}</h3>
            <p className="text-xs text-slate-400">@{student.username}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${isAssigned
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-amber-500/20 text-amber-400'
          }`}>
          {isAssigned ? 'Assigned' : 'Pending'}
        </span>
      </div>

      {student.phone && (
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Phone className="w-4 h-4" />
          <span>{student.phone}</span>
        </div>
      )}

      {student.email && (
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
          <span className="text-xs">✉️</span>
          <span className="truncate">{student.email}</span>
        </div>
      )}

      {assignment && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 mb-3">
          <div className="flex items-center gap-2 text-sm">
            <Bus className="w-4 h-4 text-orange-400" />
            <span className="text-slate-300">{assignment.bus?.name || 'No bus'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-orange-400" />
            <span className="text-slate-300 truncate">
              {assignment.stop ? `${assignment.stop.sequence}. ${assignment.stop.name}` : 'No stop'}
            </span>
          </div>
        </div>
      )}

      {!selectionMode && (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(student); }}
            className="p-2 rounded-lg text-orange-400 hover:bg-orange-500/20 transition"
            title="Edit student"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(student); }}
            disabled={isAssigned}
            className={`p-2 rounded-lg transition ${isAssigned
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-red-400 hover:bg-red-500/20'
              }`}
            title={isAssigned ? 'Remove assignment first' : 'Delete student'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

const ManageStudents = () => {
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [search, setSearch] = useState('');
  const [busFilter, setBusFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [confirmState, setConfirmState] = useState({ open: false, target: null });
  const [loading, setLoading] = useState(true);
  // CSV Upload state
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResults, setCsvResults] = useState(null);
  const fileInputRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const [studentsRes, assignmentsRes, busesRes, routesRes] = await Promise.all([
        api.get('/admin/students'),
        api.get('/admin/assignments'),
        api.get('/buses'),
        api.get('/routes')
      ]);
      setStudents(studentsRes.data);
      const assignmentMap = assignmentsRes.data.reduce((acc, assignment) => {
        if (assignment.student?._id) {
          acc[assignment.student._id] = assignment;
        }
        return acc;
      }, {});
      setAssignments(assignmentMap);
      setBuses(busesRes.data || []);
      setRoutes(routesRes.data || []);
    } catch (error) {
      toast.error('Unable to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const openCreate = () => {
    setEditingStudent(null);
    setForm(blankForm);
    setStops([]);
    setDrawerOpen(true);
  };

  const openEdit = (student) => {
    setEditingStudent(student);
    setForm({ username: student.username, password: '', name: student.name || '', phone: student.phone || '', email: student.email || '' });
    setDrawerOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      username: form.username.trim(),
      name: form.name,
      phone: form.phone,
      email: form.email.trim()
    };
    // Only include password for edit mode (manual reset by admin)
    if (editingStudent && form.password?.trim()) {
      payload.password = form.password.trim();
    }

    // Add bus and stop for new students
    if (!editingStudent) {
      payload.busId = form.busId || null;
      payload.stopId = form.stopId || null;
    }

    try {
      if (editingStudent) {
        await api.put(`/admin/students/${editingStudent._id}`, payload);
        toast.success('Student updated');
      } else {
        await api.post('/admin/students', payload);
        toast.success('Student created. Welcome email sent!');
      }
      setDrawerOpen(false);
      setEditingStudent(null);
      setForm(blankForm);
      loadStudents();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save student');
    }
  };

  const askDelete = (student) => setConfirmState({ open: true, target: student });

  const confirmDelete = async () => {
    if (!confirmState.target) return;
    try {
      await api.delete(`/admin/students/${confirmState.target._id}`);
      toast.success('Student removed');
      setConfirmState({ open: false, target: null });
      loadStudents();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to delete student');
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
    setSelectedIds(new Set(filteredStudents.map(s => s._id)));
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
        await api.delete(`/admin/students/${id}`);
        deleted++;
      } catch { /* skip failures */ }
    }
    toast.success(`${deleted} student${deleted !== 1 ? 's' : ''} deleted`);
    exitSelection();
    loadStudents();
  };

  // === CSV Upload Handlers ===
  const openCsvModal = () => {
    setCsvModalOpen(true);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvResults(null);
  };

  const closeCsvModal = () => {
    setCsvModalOpen(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvResults(null);
    setCsvUploading(false);
  };

  const handleCsvSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvResults(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, ''),
      complete: (result) => {
        setCsvPreview(result.data.slice(0, 50)); // show up to 50 rows
      },
      error: () => {
        toast.error('Failed to parse CSV file');
        setCsvFile(null);
        setCsvPreview([]);
      }
    });
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    setCsvResults(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const { data } = await api.post('/admin/students/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-type' }
      });
      setCsvResults(data);
      if (data.created > 0) {
        toast.success(`${data.created} student(s) created successfully!`);
        loadStudents();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Upload failed';
      toast.error(msg);
      setCsvResults({ created: 0, skipped: 0, errors: [{ reason: msg }] });
    } finally {
      setCsvUploading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    let result = students;

    // Text search
    const needle = search.trim().toLowerCase();
    if (needle) {
      result = result.filter((student) =>
        [student.username, student.name, student.phone, student.email].some((value) => value?.toLowerCase().includes(needle))
      );
    }

    // Bus filter
    if (busFilter) {
      result = result.filter((student) => {
        const asgn = assignments[student._id];
        return asgn?.bus?._id === busFilter || asgn?.bus === busFilter;
      });
    }

    // Route filter
    if (routeFilter) {
      result = result.filter((student) => {
        const asgn = assignments[student._id];
        const busId = asgn?.bus?._id || asgn?.bus;
        if (!busId) return false;
        const bus = buses.find(b => b._id === busId);
        const rId = bus?.route?._id || bus?.route;
        return rId === routeFilter;
      });
    }

    // Status filter
    if (statusFilter === 'assigned') {
      result = result.filter((student) => Boolean(assignments[student._id]));
    } else if (statusFilter === 'pending') {
      result = result.filter((student) => !assignments[student._id]);
    }

    return result;
  }, [students, search, busFilter, routeFilter, statusFilter, assignments, buses]);

  const assignedCount = Object.keys(assignments).length;
  const unassigned = Math.max(students.length - assignedCount, 0);

  const hasActiveFilters = search || busFilter || routeFilter || statusFilter;
  const clearFilters = () => {
    setSearch('');
    setBusFilter('');
    setRouteFilter('');
    setStatusFilter('');
  };

  // === Multi-select handlers ===
  const toggleSelectStudent = (studentId) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map((s) => s._id)));
    }
  };

  const askBulkDelete = () => {
    setBulkConfirm(true);
  };

  const confirmBulkDelete = async () => {
    try {
      await api.post('/admin/students/bulk-delete', { studentIds: Array.from(selectedIds) });
      toast.success(`${selectedIds.size} students removed`);
      setSelectedIds(new Set());
      setSelectionMode(false);
      setBulkConfirm(false);
      loadStudents();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to delete students');
    }
  };

  return (
    <main className="min-h-screen pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Student Directory</h1>
            <p className="text-sm text-slate-400 mt-1">Manage student accounts and view assignments</p>
          </div>
          <div className="flex gap-2 sm:w-auto w-full">
            <button
              onClick={openCsvModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-medium hover:bg-white/5 hover:border-white/20 transition sm:w-auto flex-1"
            >
              <Upload className="w-5 h-5" />
              Upload CSV
            </button>
            <button
              onClick={openCreate}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition sm:w-auto flex-1"
            >
              <Plus className="w-5 h-5" />
              Add Student
            </button>
            <button
              onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition sm:w-auto flex-1 ${selectionMode
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20'
                }`}
            >
              <MousePointerClick className="w-5 h-5" />
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={Users} label="Total Students" value={students.length} subtitle="Registered" color="orange" />
          <StatCard icon={CheckCircle} label="Assigned" value={assignedCount} subtitle="To buses" color="emerald" />
          <StatCard icon={Clock} label="Pending" value={unassigned} subtitle="Awaiting" color="amber" />
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
                placeholder="Search by name, roll number, phone, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
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
                className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-white focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer"
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
                className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-white focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="assigned">Assigned</option>
                <option value="pending">Pending</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Route Filter */}
            <div className="relative sm:w-48">
              <Route className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-white focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer"
              >
                <option value="">All Routes</option>
                {routes.map((route) => (
                  <option key={route._id} value={route._id}>
                    {route.name}
                  </option>
                ))}
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
                  className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5"
                >
                  <X className="w-3 h-3" />
                  Clear all
                </button>
              )}
              {search && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/15 text-orange-300 text-xs">
                  Search: "{search.length > 15 ? search.slice(0, 15) + '…' : search}"
                  <button onClick={() => setSearch('')} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              )}
              {busFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/15 text-orange-300 text-xs">
                  Bus: {buses.find(b => b._id === busFilter)?.name || 'Unknown'}
                  <button onClick={() => setBusFilter('')} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              )}
              {routeFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/15 text-orange-300 text-xs">
                  Route: {routes.find(r => r._id === routeFilter)?.name || 'Unknown'}
                  <button onClick={() => setRouteFilter('')} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/15 text-orange-300 text-xs">
                  {statusFilter === 'assigned' ? '✓ Assigned' : '⏳ Pending'}
                  <button onClick={() => setStatusFilter('')} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 flex-shrink-0">
              {filteredStudents.length} of {students.length} student{students.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Students Grid */}
        {loading ? (
          <TrackMateLoader compact message="Loading students..." />
        ) : filteredStudents.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudents.map((student) => (
              <StudentCard
                key={student._id}
                student={student}
                assignment={assignments[student._id]}
                onEdit={openEdit}
                onDelete={askDelete}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(student._id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No students found</p>
            <p className="text-sm text-slate-500 mt-1">
              {search ? 'Try a different search term' : 'Add your first student to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Drawer */}
      <Drawer
        isOpen={drawerOpen}
        title={editingStudent ? 'Edit Student' : 'Add New Student'}
        subtitle="Student credentials for the mobile app"
        onClose={() => setDrawerOpen(false)}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="student-form"
              className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition"
            >
              {editingStudent ? 'Save Changes' : 'Add Student'}
            </button>
          </div>
        }
      >
        <form id="student-form" className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">Roll Number / Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
              placeholder="e.g., 21CS101"
              required
            />
          </div>
          {editingStudent && (
            <div>
              <label className="text-sm text-slate-300 mb-1.5 block">Reset Password</label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
                placeholder="Leave blank to keep current"
              />
            </div>
          )}
          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">Full Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
              placeholder="e.g., John Doe"
            />
          </div>
          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
              placeholder="e.g., +1 234 567 8900"
            />
          </div>
          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">Email Address <span className="text-red-400">*</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50"
              placeholder="e.g., student@example.com"
              required
            />
            <p className="text-xs text-slate-400 mt-1">Welcome email will be sent to this address</p>
          </div>

          {!editingStudent && (
            <>
              <div>
                <label className="text-sm text-slate-300 mb-1.5 block">Assign Bus (Optional)</label>
                <select
                  value={form.busId}
                  onChange={async (e) => {
                    const busId = e.target.value;
                    setForm((prev) => ({ ...prev, busId, stopId: '' }));
                    setStops([]);
                    if (busId) {
                      const selectedBus = buses.find(b => b._id === busId);
                      if (selectedBus?.route?._id || selectedBus?.route) {
                        const routeId = selectedBus.route._id || selectedBus.route;
                        try {
                          setLoadingStops(true);
                          const { data } = await api.get(`/stops/${routeId}`);
                          setStops(data);
                        } catch {
                          toast.error('Failed to load stops');
                        } finally {
                          setLoadingStops(false);
                        }
                      }
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white focus:outline-none focus:border-orange-500/50"
                >
                  <option value="">Select a bus (optional)</option>
                  {buses.map((bus) => (
                    <option key={bus._id} value={bus._id}>
                      {bus.numberPlate} - {bus.name}
                    </option>
                  ))}
                </select>
              </div>

              {form.busId && (
                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block">Assign Stop (Optional)</label>
                  {loadingStops ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-400">
                      <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      Loading stops...
                    </div>
                  ) : stops.length > 0 ? (
                    <select
                      value={form.stopId}
                      onChange={(e) => setForm((prev) => ({ ...prev, stopId: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white focus:outline-none focus:border-orange-500/50"
                    >
                      <option value="">Select a stop (optional)</option>
                      {stops.map((stop) => (
                        <option key={stop._id} value={stop._id}>
                          {stop.sequence}. {stop.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-amber-400 px-1">No stops found for this bus&apos;s route. Add stops to the route first.</p>
                  )}
                </div>
              )}
            </>
          )}
        </form>
      </Drawer>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title="Delete Student"
        message={`Are you sure you want to remove ${confirmState.target?.name || confirmState.target?.username}?`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmState({ open: false, target: null })}
      />

      {/* ===== CSV Upload Modal ===== */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={closeCsvModal}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Bulk Upload Students</h3>
                  <p className="text-xs text-slate-400">Upload a CSV file with student details</p>
                </div>
              </div>
              <button onClick={closeCsvModal} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* File picker */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed border-white/10 hover:border-orange-500/50 text-slate-400 hover:text-orange-400 transition cursor-pointer"
                >
                  <Upload className="w-8 h-8" />
                  <span className="text-sm font-medium">{csvFile ? csvFile.name : 'Click to select CSV file'}</span>
                  <span className="text-xs text-slate-500">Columns: fullname, rollno, email, busname (optional)</span>
                </button>
              </div>

              {/* Preview table */}
              {csvPreview.length > 0 && (
                <div>
                  <p className="text-sm text-slate-300 mb-2 font-medium">
                    Preview ({csvPreview.length} row{csvPreview.length !== 1 ? 's' : ''})
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-800/80">
                          <th className="text-left px-3 py-2 text-slate-400 font-medium">#</th>
                          <th className="text-left px-3 py-2 text-slate-400 font-medium">Full Name</th>
                          <th className="text-left px-3 py-2 text-slate-400 font-medium">Roll No</th>
                          <th className="text-left px-3 py-2 text-slate-400 font-medium">Email</th>
                          <th className="text-left px-3 py-2 text-slate-400 font-medium">Bus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                            <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                            <td className="px-3 py-2 text-white">{row.fullname || row.name || '—'}</td>
                            <td className="px-3 py-2 text-orange-400 font-mono">{row.rollno || row.rollnumber || row.username || '—'}</td>
                            <td className="px-3 py-2 text-slate-300">{row.email || row.emailid || row.mailid || '—'}</td>
                            <td className="px-3 py-2 text-slate-400">{row.busname || row.bus || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Results */}
              {csvResults && (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-emerald-400">Created</p>
                      <p className="text-xl font-bold text-emerald-400">{csvResults.created}</p>
                    </div>
                    <div className="flex-1 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <p className="text-xs text-amber-400">Skipped</p>
                      <p className="text-xl font-bold text-amber-400">{csvResults.skipped}</p>
                    </div>
                  </div>
                  {csvResults.errors?.length > 0 && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                      <p className="text-xs text-red-400 mb-2 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Issues
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {csvResults.errors.map((e, i) => (
                          <p key={i} className="text-xs text-red-300">
                            {e.row ? `Row ${e.row}` : ''} {e.rollno ? `(${e.rollno})` : ''}: {e.reason}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-white/10">
              <button
                onClick={closeCsvModal}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition"
              >
                {csvResults ? 'Close' : 'Cancel'}
              </button>
              {!csvResults && (
                <button
                  onClick={handleCsvUpload}
                  disabled={!csvFile || csvUploading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {csvUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload & Create Students
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Selection Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-white/10 backdrop-blur-lg rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-fade-in">
          <p className="text-sm text-white font-medium whitespace-nowrap">
            {selectedIds.size} selected
          </p>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={selectAll}
            className="text-xs text-orange-400 hover:text-orange-300 font-medium whitespace-nowrap"
          >
            Select all ({filteredStudents.length})
          </button>
          <button
            onClick={exitSelection}
            className="text-xs text-slate-400 hover:text-white font-medium whitespace-nowrap"
          >
            Deselect
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={() => setBulkConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium text-sm transition"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        open={bulkConfirm}
        title="Delete Selected Students"
        message={`Are you sure you want to delete ${selectedIds.size} selected student${selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel="Delete All"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkConfirm(false)}
      />
    </main>
  );
};

export default ManageStudents;

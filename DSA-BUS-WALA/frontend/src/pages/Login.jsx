import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import { Eye, EyeOff, Loader2, LogIn, CheckCircle, X, KeyRound, MapPin, Shield, Bell } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotResult, setForgotResult] = useState(null); // { type: 'success'|'error', message }
  const { login, user } = useAuth();

  const targetPath = useMemo(() => {
    if (!user) return null;
    // Redirect to profile if first login to change password
    if (user.firstLogin) return '/profile';
    if (user.role === 'admin') return '/admin';
    if (user.role === 'driver') return '/driver';
    if (user.role === 'student') return '/student';
    return '/login';
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ username, password });
    } catch (err) {
      console.error('Auth error:', err);
      const errorMsg = err.response?.data?.message
        || err.response?.data?.error
        || err.message
        || 'Login failed';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const openForgotPassword = () => {
    setShowForgotPassword(true);
    setForgotIdentifier('');
    setForgotResult(null);
  };

  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setForgotIdentifier('');
    setForgotResult(null);
    setForgotLoading(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) return;
    setForgotLoading(true);
    setForgotResult(null);

    try {
      const res = await api.post('/auth/forgot-password', { identifier: forgotIdentifier.trim() });
      setForgotResult({ type: 'success', message: res.data.message || 'Check your email for the password.' });
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong. Try again.';
      setForgotResult({ type: 'error', message: msg });
    } finally {
      setForgotLoading(false);
    }
  };

  if (targetPath) {
    return <Navigate to={targetPath} replace />;
  }

  return (
    <main className="login-page">
      {/* ===== LEFT PANEL — Visual Story ===== */}
      <div className="login-hero">
        {/* Animated background shapes */}
        <div className="login-hero-bg">
          <div className="hero-circle hero-circle-1" />
          <div className="hero-circle hero-circle-2" />
          <div className="hero-circle hero-circle-3" />
        </div>

        <div className="login-hero-content">
          {/* Logo */}
          <img
            src="/logohorigental.svg"
            alt="TrackMate"
            className="login-hero-logo"
          />

          {/* Tagline */}
          <h1 className="login-hero-title">Smart Bus Tracking Made Simple</h1>
          <p className="login-hero-subtitle">Track. Ride. Arrive safely.</p>

          {/* Feature pills */}
          <div className="login-hero-features">
            <div className="hero-feature-pill">
              <MapPin className="w-4 h-4" />
              <span>Live Tracking</span>
            </div>
            <div className="hero-feature-pill">
              <Bell className="w-4 h-4" />
              <span>Smart Alerts</span>
            </div>
            <div className="hero-feature-pill">
              <Shield className="w-4 h-4" />
              <span>Secure Login</span>
            </div>
          </div>

          {/* Floating bus SVG illustration */}
          <div className="login-hero-illustration">
            <svg viewBox="0 0 320 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xs opacity-30">
              {/* Route line */}
              <path d="M 20 80 Q 80 20 160 60 T 300 40" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeDasharray="6 4" fill="none">
                <animate attributeName="stroke-dashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
              </path>
              {/* Bus body */}
              <rect x="120" y="50" width="80" height="40" rx="8" fill="rgba(255,255,255,0.25)">
                <animateTransform attributeName="transform" type="translate" values="0,0;4,-2;0,0" dur="3s" repeatCount="indefinite" />
              </rect>
              {/* Bus windows */}
              <rect x="130" y="56" width="14" height="12" rx="2" fill="rgba(255,255,255,0.4)">
                <animateTransform attributeName="transform" type="translate" values="0,0;4,-2;0,0" dur="3s" repeatCount="indefinite" />
              </rect>
              <rect x="150" y="56" width="14" height="12" rx="2" fill="rgba(255,255,255,0.4)">
                <animateTransform attributeName="transform" type="translate" values="0,0;4,-2;0,0" dur="3s" repeatCount="indefinite" />
              </rect>
              <rect x="170" y="56" width="14" height="12" rx="2" fill="rgba(255,255,255,0.4)">
                <animateTransform attributeName="transform" type="translate" values="0,0;4,-2;0,0" dur="3s" repeatCount="indefinite" />
              </rect>
              {/* Wheels */}
              <circle cx="140" cy="92" r="6" fill="rgba(255,255,255,0.3)">
                <animateTransform attributeName="transform" type="translate" values="0,0;4,-2;0,0" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx="180" cy="92" r="6" fill="rgba(255,255,255,0.3)">
                <animateTransform attributeName="transform" type="translate" values="0,0;4,-2;0,0" dur="3s" repeatCount="indefinite" />
              </circle>
              {/* Stop dots */}
              <circle cx="40" cy="72" r="5" fill="rgba(255,255,255,0.5)">
                <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="270" cy="44" r="5" fill="rgba(255,255,255,0.5)">
                <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
              </circle>
            </svg>
          </div>
        </div>
      </div>

      {/* ===== RIGHT PANEL — Auth Card ===== */}
      <div className="login-form-panel">
        <div className="login-card login-card-animate">
          {/* Mobile logo (hidden on desktop) */}
          <div className="login-card-mobile-logo">
            <img src="/logohorigental.svg" alt="TrackMate" className="h-10 mobile-logo-img" />
          </div>

          {/* Card Header */}
          <div className="mb-7">
            <h2 className="login-card-title">Welcome Back</h2>
            <p className="login-card-subtitle">Log in to continue tracking your bus</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Username / Roll Number */}
            <div className="login-field">
              <label className="login-label">Roll Number / Username</label>
              <input
                type="text"
                placeholder="Enter roll number or username"
                className="login-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div className="login-field">
              <label className="login-label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="login-input pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={openForgotPassword}
                  className="text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="login-error login-card-animate">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="login-btn-primary"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Log In
                </>
              )}
            </button>
          </form>

          {/* Footer hint */}
          <p className="login-footer-hint mt-6">
            Contact your administrator if you need an account trackmate15@gmail.com
          </p>
        </div>
      </div>

      {/* ===== Forgot Password Modal ===== */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={closeForgotPassword}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="login-modal login-card-animate"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              type="button"
              onClick={closeForgotPassword}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Forgot Password</h3>
                <p className="text-xs text-gray-500">We&apos;ll reset and email your credentials</p>
              </div>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="login-field">
                <label className="login-label">Roll Number or Email</label>
                <input
                  type="text"
                  placeholder="Enter your roll number or email"
                  className="login-input"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  required
                  autoFocus
                  disabled={forgotLoading}
                />
              </div>

              {/* Result */}
              {forgotResult && (
                <div
                  className={`login-card-animate rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${forgotResult.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border border-red-200 text-red-600'
                    }`}
                >
                  {forgotResult.type === 'success'
                    ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  }
                  <span>{forgotResult.message}</span>
                </div>
              )}

              {forgotResult?.type === 'success' ? (
                <button
                  type="button"
                  onClick={closeForgotPassword}
                  className="w-full rounded-xl bg-gray-100 py-3 text-gray-700 font-semibold hover:bg-gray-200 transition-all active:scale-[0.98]"
                >
                  Back to Login
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={forgotLoading || !forgotIdentifier.trim()}
                  className="login-btn-primary"
                >
                  {forgotLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

export default Login;

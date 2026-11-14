import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Shield } from 'lucide-react';
import { api, setAuthToken } from '../api/client.js';
import { User } from '../types.js';

export function AuthModal({
  isOpen,
  onClose,
  onLoginSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.login({ username, password });
      setAuthToken(res.token);
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-[960px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-scale-in">

        {/* Left panel — branding */}
        <div className="w-full md:w-[440px] bg-charcoal text-white p-8 md:p-10 flex flex-col justify-between gap-8 shrink-0 relative overflow-hidden">
          {/* Decorative accent */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-lime/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-lime/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-lime text-charcoal flex items-center justify-center font-extrabold text-lg">
                CS
              </div>
              <span className="font-bold text-xl tracking-tight">CyberSwaRaksha</span>
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="text-3xl md:text-[2.5rem] font-extrabold leading-[1.1] tracking-tight">
                Race-proof team<br />formation.
              </h1>
              <p className="text-[15px] leading-relaxed text-neutral-400 max-w-[340px]">
                One seat, one claim. Build your team with zero double bookings and real-time board updates.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-4 pt-6 border-t border-neutral-700">
            <div className="flex flex-col">
              <span className="text-2xl font-extrabold text-lime">1</span>
              <span className="text-xs text-neutral-400 mt-0.5">team per person</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-extrabold text-lime">0</span>
              <span className="text-xs text-neutral-400 mt-0.5">double bookings</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-extrabold text-lime">Live</span>
              <span className="text-xs text-neutral-400 mt-0.5">board updates</span>
            </div>
          </div>
        </div>

        {/* Right panel — login form */}
        <div className="flex-1 p-8 md:p-10 flex flex-col justify-center">
          <div className="max-w-[360px] mx-auto w-full flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-charcoal">Judge Sign In</h2>
              <p className="text-sm text-muted mt-1">Choose an admin or participant demo account.</p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-danger text-sm flex items-center gap-2 animate-slide-down">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-charcoal">Username</label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="user40000"
                  className="h-12 px-4 border border-cardBorder rounded-xl bg-canvas text-charcoal text-[15px] focus:outline-none focus:border-charcoal focus:ring-1 focus:ring-charcoal/10 placeholder:text-subtle"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-charcoal">Password</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="h-12 px-4 border border-cardBorder rounded-xl bg-canvas text-charcoal text-[15px] focus:outline-none focus:border-charcoal focus:ring-1 focus:ring-charcoal/10 placeholder:text-subtle"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 rounded-xl bg-charcoal hover:bg-neutral-800 text-white font-semibold text-[15px] shadow-sm disabled:opacity-50 mt-2 flex items-center justify-center gap-2 group"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="border border-cardBorder rounded-xl p-4 bg-canvas">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-muted" />
                <span className="text-[11px] font-semibold text-muted tracking-wider uppercase">Public demo credentials</span>
              </div>
              <div className="font-mono text-xs text-charcoal mt-2 space-y-1">
                <p>Admin: <span className="font-semibold">adminbro</span> / <span className="font-semibold">Demo@12345</span></p>
                <p>Usernames: <span className="font-semibold">user40000 through user40010</span></p>
                <p>Participant password: <span className="font-semibold">Demo@12345</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

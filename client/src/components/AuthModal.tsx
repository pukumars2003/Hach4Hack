import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
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
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('user00001@demo.test');
  const [password, setPassword] = useState('Demo@12345');
  const [name, setName] = useState('Ajay');
  const [skills, setSkills] = useState('React, TypeScript, Postgres');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isRegister) {
        const res = await api.register({
          email,
          password,
          name: name || email.split('@')[0],
          skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
          interests: ['Distributed Systems', 'Full Stack'],
          timezoneOffsetMinutes: 330, // Default UTC+5:30
        });
        setAuthToken(res.token);
        onLoginSuccess(res.user);
        onClose();
      } else {
        const res = await api.login({ email, password });
        setAuthToken(res.token);
        onLoginSuccess(res.user);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Demo@12345');
    setIsRegister(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-canvas border border-cardBorder rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/80 border border-cardBorder text-muted hover:text-charcoal flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Side: Dark Pine Banner */}
        <div className="w-full md:w-[420px] bg-pine text-[#F3F1EA] p-8 md:p-10 flex flex-col justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 font-bold text-xl">
            <div className="w-9 h-9 rounded-lg bg-mint text-pine flex items-center justify-center font-bold text-lg">
              T
            </div>
            <span>TeamForge</span>
          </div>

          <div className="flex flex-col gap-4">
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              Find your team.<br />One seat, one winner.
            </h1>
            <p className="text-[15px] leading-relaxed text-[#C9D8D5]">
              Create a team, share an invite code, or ask to join. The board updates live for everyone, and a seat can never be taken twice.
            </p>
          </div>

          <div className="flex gap-6 text-[13px] text-[#C9D8D5] pt-4 border-t border-[#1B4743]">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-[#F3F1EA]">1</span>
              <span>team per person</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-[#F3F1EA]">0</span>
              <span>double bookings</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-[#F3F1EA]">Live</span>
              <span>board updates</span>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="flex-1 p-6 md:p-10 flex flex-col justify-center">
          <div className="max-w-[360px] mx-auto w-full flex flex-col gap-5">
            {/* Tab Switcher */}
            <div className="flex gap-1 bg-[#E8E6DE] rounded-[10px] p-1">
              <button
                type="button"
                onClick={() => setIsRegister(false)}
                className={`flex-1 h-9 rounded-lg text-[14px] font-semibold transition-colors ${
                  !isRegister ? 'bg-white text-charcoal shadow-sm' : 'text-muted hover:text-charcoal'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setIsRegister(true)}
                className={`flex-1 h-9 rounded-lg text-[14px] font-semibold transition-colors ${
                  isRegister ? 'bg-white text-charcoal shadow-sm' : 'text-muted hover:text-charcoal'
                }`}
              >
                Create account
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isRegister && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-semibold text-charcoal">Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ajay Kumar"
                      className="h-11 px-3.5 border border-borderMuted rounded-[10px] bg-white text-charcoal text-[15px] focus:outline-none focus:border-teal"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-semibold text-charcoal">Skills (comma separated)</label>
                    <input
                      type="text"
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      placeholder="React, TypeScript, Postgres"
                      className="h-11 px-3.5 border border-borderMuted rounded-[10px] bg-white text-charcoal text-[15px] focus:outline-none focus:border-teal"
                    />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-charcoal">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user00001@demo.test"
                  className="h-11 px-3.5 border border-borderMuted rounded-[10px] bg-white text-charcoal text-[15px] focus:outline-none focus:border-teal"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-charcoal">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Demo@12345"
                  className="h-11 px-3.5 border border-borderMuted rounded-[10px] bg-white text-charcoal text-[15px] focus:outline-none focus:border-teal"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 rounded-[10px] bg-teal hover:bg-teal-hover text-white font-semibold text-[15px] transition-colors shadow-sm disabled:opacity-50 mt-1"
              >
                {isSubmitting ? 'Verifying...' : isRegister ? 'Create account' : 'Sign in'}
              </button>
            </form>

            {/* Seeded Demo Accounts Box */}
            <div className="border border-dashed border-subtle rounded-xl p-3.5 flex flex-col gap-2 bg-[#FBFAF6]">
              <div className="text-[11px] font-semibold text-muted tracking-wider uppercase">
                DEMO ACCOUNTS (SEEDED)
              </div>
              <div className="font-mono text-[12px] leading-relaxed text-charcoal">
                <span
                  onClick={() => handleQuickFill('user00001@demo.test')}
                  className="cursor-pointer hover:text-teal font-semibold underline decoration-dotted"
                  title="Click to fill"
                >
                  user00001@demo.test
                </span>{' '}
                · Demo@12345
                <br />
                <span
                  onClick={() => handleQuickFill('user00002@demo.test')}
                  className="cursor-pointer hover:text-teal font-semibold underline decoration-dotted"
                  title="Click to fill"
                >
                  user00002@demo.test
                </span>{' '}
                · Demo@12345
              </div>
              <div className="text-[11px] text-muted">
                Click any email to autofill. Or register with any email & password.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

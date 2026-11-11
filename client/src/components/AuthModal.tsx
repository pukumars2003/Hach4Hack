import React, { useState } from 'react';
import { LogIn, UserPlus, Sparkles, AlertCircle } from 'lucide-react';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [skills, setSkills] = useState('React, TypeScript');
  const [interests, setInterests] = useState('AI Agents');
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
          name,
          skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
          interests: interests.split(',').map((i) => i.trim()).filter(Boolean),
          timezoneOffsetMinutes: 0,
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
      setError(err.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Demo Login helper
  const handleDemoLogin = async (role: 'leader' | 'member' | 'candidate') => {
    setIsSubmitting(true);
    setError(null);
    const demoEmail = `demo_${role}_${Math.floor(Date.now() / 86400000)}@hackathon.org`;

    try {
      // Register or login
      let res;
      try {
        res = await api.login({ email: demoEmail, password: 'Hackathon2026!' });
      } catch {
        res = await api.register({
          email: demoEmail,
          password: 'Hackathon2026!',
          name: role === 'leader' ? 'Demo Leader' : role === 'member' ? 'Demo Member' : 'Demo Candidate',
          skills: role === 'leader' ? ['React', 'Node.js'] : ['Python', 'Docker'],
          interests: ['Distributed Systems'],
          timezoneOffsetMinutes: 0,
        });
      }
      setAuthToken(res.token);
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="text-center pb-2">
          <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <span>{isRegister ? 'Create Participant Account' : 'Welcome to Hackathon 2026'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sign in to create teams, redeem invite codes, and browse teammates.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Demo Sign-in buttons */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-2 text-center">
            Instant 1-Click Evaluator Sign-In
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('leader')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 text-xs font-bold transition-colors"
            >
              Sign In as Leader
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('candidate')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-blue-400 border border-slate-800 text-xs font-bold transition-colors"
            >
              Sign In as Candidate
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {isRegister && (
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Your Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ada@hackathon.org"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Your Skills (Comma separated)</label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="React, Node.js, Python"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Interests</label>
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="AI Agents, Systems"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md active:scale-95"
            >
              {isSubmitting ? 'Authenticating...' : isRegister ? 'Register' : 'Sign In'}
            </button>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
              }}
              className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
            >
              {isRegister ? 'Already registered? Sign in instead' : "Don't have an account? Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


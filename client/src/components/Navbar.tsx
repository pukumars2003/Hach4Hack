import React from 'react';
import { Users, Plus, KeyRound, Zap, HelpCircle, LogOut } from 'lucide-react';
import { User } from '../types.js';

interface NavbarProps {
  currentUser: User | null;
  onOpenCreateTeam: () => void;
  onOpenJoinCode: () => void;
  onToggleLab: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
  activeTab: 'board' | 'my-team' | 'lab';
  setActiveTab: (tab: 'board' | 'my-team' | 'lab') => void;
  hasTeam: boolean;
}

export function Navbar({
  currentUser,
  onOpenCreateTeam,
  onOpenJoinCode,
  onToggleLab,
  onOpenHelp,
  onLogout,
  activeTab,
  setActiveTab,
  hasTeam,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => setActiveTab('board')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
                RaceProof <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">PS1</span>
              </span>
              <span className="text-[11px] text-slate-400 block -mt-1 font-medium">
                Concurrency Championship 2026
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('board')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'board'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Teammate Board
            </button>
            {hasTeam && (
              <button
                onClick={() => setActiveTab('my-team')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === 'my-team'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                My Team
              </button>
            )}
            <button
              onClick={() => setActiveTab('lab')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'lab'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Concurrency Lab</span>
            </button>
          </nav>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenJoinCode}
            title="Join by Invite Code (J)"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 transition-all hover:border-slate-700"
          >
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Join with Code</span>
            <kbd className="hidden sm:inline text-[10px] bg-slate-950 px-1.5 py-0.5 rounded text-slate-400 border border-slate-800 font-mono">
              J
            </kbd>
          </button>

          {!hasTeam && (
            <button
              onClick={onOpenCreateTeam}
              title="Create Team (C)"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="hidden sm:inline">Create Team</span>
              <kbd className="hidden sm:inline text-[10px] bg-emerald-600/30 text-slate-950 px-1.5 py-0.5 rounded font-mono">
                C
              </kbd>
            </button>
          )}

          <button
            onClick={onOpenHelp}
            title="Keyboard Shortcuts (?)"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <button
                onClick={onLogout}
                title="Log out"
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

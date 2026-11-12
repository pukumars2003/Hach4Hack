import React from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { User } from '../types.js';

interface NavbarProps {
  currentUser: User | null;
  onOpenCreateTeam: () => void;
  onOpenJoinCode: () => void;
  onToggleLab: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
  activeTab: 'board' | 'my-team' | 'suggestions' | 'lab';
  setActiveTab: (tab: 'board' | 'my-team' | 'suggestions' | 'lab') => void;
  hasTeam: boolean;
  onOpenAuth?: () => void;
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
  onOpenAuth,
}: NavbarProps) {
  const getInitials = (name?: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="h-16 bg-white border-b border-cardBorder sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-full flex items-center justify-between gap-6">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-8">
          <div
            onClick={() => setActiveTab('board')}
            className="flex items-center gap-2.5 font-bold text-lg cursor-pointer select-none text-charcoal"
          >
            <div className="w-[30px] h-[30px] rounded-lg bg-teal text-white flex items-center justify-center font-bold text-base shadow-sm">
              T
            </div>
            <span className="tracking-tight text-[18px]">TeamForge</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setActiveTab('board')}
              className={`px-3.5 py-2 rounded-lg font-semibold text-[15px] transition-colors ${
                activeTab === 'board'
                  ? 'bg-teal-light text-teal-dark'
                  : 'text-muted hover:text-charcoal'
              }`}
            >
              Board
            </button>

            {hasTeam && (
              <button
                onClick={() => setActiveTab('my-team')}
                className={`px-3.5 py-2 rounded-lg font-semibold text-[15px] transition-colors ${
                  activeTab === 'my-team'
                    ? 'bg-teal-light text-teal-dark'
                    : 'text-muted hover:text-charcoal'
                }`}
              >
                My team
              </button>
            )}

            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-3.5 py-2 rounded-lg font-semibold text-[15px] transition-colors ${
                activeTab === 'suggestions'
                  ? 'bg-teal-light text-teal-dark'
                  : 'text-muted hover:text-charcoal'
              }`}
            >
              Suggestions
            </button>

            <button
              onClick={() => setActiveTab('lab')}
              className={`px-3.5 py-2 rounded-lg font-semibold text-[15px] transition-colors flex items-center gap-1.5 ${
                activeTab === 'lab'
                  ? 'bg-teal-light text-teal-dark'
                  : 'text-muted hover:text-charcoal'
              }`}
            >
              <span>Race test</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                50 VUs
              </span>
            </button>
          </nav>
        </div>

        {/* Right Section: Live Pulse, Shortcuts, User Profile */}
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Live Indicator */}
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-dark select-none hidden sm:flex">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse inline-block"></span>
            <span>Live</span>
          </div>

          {/* Keyboard help (?) */}
          <button
            onClick={onOpenHelp}
            title="Keyboard shortcuts (?)"
            className="w-8 h-8 rounded-full border border-cardBorder text-muted hover:text-charcoal flex items-center justify-center text-xs font-mono transition-colors"
          >
            ?
          </button>

          {/* User Logged-in State */}
          {currentUser ? (
            <div className="flex items-center gap-3 pl-2 border-l border-borderLight">
              <div
                title={`${currentUser.name} (${currentUser.email})`}
                className="w-9 h-9 rounded-full bg-pine text-[#F3F1EA] flex items-center justify-center font-bold text-sm shadow-sm shrink-0"
              >
                {getInitials(currentUser.name)}
              </div>

              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="font-semibold text-[13px] text-charcoal truncate max-w-[140px]">
                  {currentUser.name}
                </span>
                <span className="text-[11px] text-muted truncate max-w-[140px]">
                  {currentUser.email}
                </span>
              </div>

              <button
                onClick={onLogout}
                title="Sign out"
                className="h-8 px-2.5 border border-cardBorder rounded-lg text-xs font-semibold text-muted hover:text-danger hover:border-danger/40 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 pl-2 border-l border-borderLight">
              <span className="hidden sm:inline text-xs text-muted font-medium bg-canvas px-2.5 py-1 rounded border border-cardBorder">
                Guest Mode
              </span>
              <button
                onClick={onOpenAuth}
                className="h-9 px-4 rounded-lg bg-teal hover:bg-teal-hover text-white text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <UserIcon className="w-4 h-4" />
                <span>Sign in</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

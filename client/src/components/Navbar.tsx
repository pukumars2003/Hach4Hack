import React from 'react';
import { LogOut, User as UserIcon, Shield } from 'lucide-react';
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
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
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
  isAdmin,
  onOpenAdmin,
}: NavbarProps) {
  const getInitials = (name?: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="h-16 bg-charcoal sticky top-0 z-40 border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-full flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-6 lg:gap-8">
          <div
            onClick={() => setActiveTab('board')}
            className="flex items-center gap-2.5 font-bold text-lg cursor-pointer select-none text-white"
          >
            <div className="w-[30px] h-[30px] rounded-lg bg-lime text-charcoal flex items-center justify-center font-extrabold text-sm">
              CS
            </div>
            <span className="tracking-tight text-[17px] hidden sm:inline">CyberSwaRaksha</span>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('board')}
              className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                activeTab === 'board'
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Board
            </button>

            {hasTeam && (
              <button
                onClick={() => setActiveTab('my-team')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                  activeTab === 'my-team'
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                My team
              </button>
            )}

            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                activeTab === 'suggestions'
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Suggestions
            </button>

            <button
              onClick={() => setActiveTab('lab')}
              className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5 ${
                activeTab === 'lab'
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span>Race test</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-lime/20 text-lime font-bold">
                50 VUs
              </span>
            </button>
          </nav>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-lime select-none">
            <span className="w-2 h-2 rounded-full bg-lime animate-pulse-soft inline-block" />
            <span>Live</span>
          </div>

          {/* Admin dashboard */}
          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              title="Admin dashboard"
              className="h-8 px-2.5 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          {/* Keyboard help */}
          <button
            onClick={onOpenHelp}
            title="Keyboard shortcuts"
            className="w-8 h-8 rounded-lg border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 flex items-center justify-center text-xs font-mono transition-colors"
          >
            ?
          </button>

          {/* User state */}
          {currentUser ? (
            <div className="flex items-center gap-3 pl-3 border-l border-neutral-700">
              <div
                title={`${currentUser.name} (${currentUser.email})`}
                className="w-8 h-8 rounded-lg bg-lime text-charcoal flex items-center justify-center font-bold text-xs shrink-0"
              >
                {getInitials(currentUser.name)}
              </div>

              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="font-semibold text-[13px] text-white truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                <span className="text-[11px] text-neutral-400 truncate max-w-[120px]">
                  {currentUser.email}
                </span>
              </div>

              <button
                onClick={onLogout}
                title="Sign out"
                className="h-8 px-2.5 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-3 border-l border-neutral-700">
              <button
                onClick={onOpenAuth}
                className="h-9 px-4 rounded-lg bg-lime hover:bg-lime-dark text-charcoal text-sm font-semibold transition-colors flex items-center gap-1.5"
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

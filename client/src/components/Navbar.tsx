import React, { useState } from 'react';
import { LogOut, User as UserIcon, Shield, Menu, X } from 'lucide-react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigateTo = (tab: 'board' | 'my-team' | 'suggestions' | 'lab') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const navClass = (tab: 'board' | 'my-team' | 'suggestions' | 'lab') =>
    `px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
      activeTab === tab
        ? 'bg-lime text-charcoal'
        : 'text-neutral-600 hover:bg-neutral-100 hover:text-charcoal'
    }`;

  const getInitials = (name?: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="bg-white sticky top-0 z-40 border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 min-h-16">
        <div className="h-16 flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-5 lg:gap-8 min-w-0">
          <button
            type="button"
            onClick={() => navigateTo('board')}
            aria-label="CyberSwaRaksha home"
            className="flex items-center gap-2.5 font-bold text-lg cursor-pointer select-none text-charcoal shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-lime text-charcoal flex items-center justify-center font-extrabold text-sm">
              CS
            </div>
            <span className="hidden min-[360px]:inline tracking-tight text-[16px] sm:text-[17px]">CyberSwaRaksha</span>
          </button>

          {/* Navigation */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-1">
            <button
              onClick={() => navigateTo('board')}
              className={navClass('board')}
            >
              Board
            </button>

            {hasTeam && (
              <button
                onClick={() => navigateTo('my-team')}
                className={navClass('my-team')}
              >
                My team
              </button>
            )}

            <button
              onClick={() => navigateTo('suggestions')}
              className={navClass('suggestions')}
            >
              Suggestions
            </button>

            <button
              onClick={() => navigateTo('lab')}
              className={`${navClass('lab')} flex items-center gap-1.5`}
            >
              <span>Race test</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-lime/30 text-charcoal font-bold">
                50 VUs
              </span>
            </button>
          </nav>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Live indicator */}
          <div className="hidden lg:flex items-center gap-1.5 text-sm font-semibold text-charcoal select-none">
            <span className="w-2 h-2 rounded-full bg-lime animate-pulse-soft inline-block" />
            <span>Live</span>
          </div>

          {/* Admin dashboard */}
          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              title="Admin dashboard"
              className="h-8 px-2.5 rounded-lg border border-neutral-200 text-neutral-600 hover:text-charcoal hover:border-neutral-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          {/* Keyboard help */}
          <button
            onClick={onOpenHelp}
            title="Keyboard shortcuts"
            className="hidden sm:flex w-9 h-9 rounded-lg border border-neutral-200 text-neutral-600 hover:text-charcoal hover:border-neutral-400 items-center justify-center text-xs font-mono transition-colors"
          >
            ?
          </button>

          {/* User state */}
          {currentUser ? (
            <div className="flex items-center gap-2 sm:gap-3 sm:pl-3 sm:border-l border-neutral-200">
              <div
                title={`${currentUser.name} (${currentUser.email})`}
                className="w-8 h-8 rounded-lg bg-lime text-charcoal flex items-center justify-center font-bold text-xs shrink-0"
              >
                {getInitials(currentUser.name)}
              </div>

              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="font-semibold text-[13px] text-charcoal truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                <span className="text-[11px] text-neutral-500 truncate max-w-[120px]">
                  {currentUser.email}
                </span>
              </div>

              <button
                onClick={onLogout}
                title="Sign out"
                aria-label="Sign out"
                className="h-9 sm:h-8 px-2 sm:px-2.5 border border-neutral-200 rounded-lg text-xs font-medium text-neutral-600 hover:text-charcoal hover:border-neutral-400 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:pl-3 sm:border-l border-neutral-200">
              <button
                onClick={onOpenAuth}
                className="h-9 px-3 sm:px-4 rounded-lg bg-lime hover:bg-lime-dark text-charcoal text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <UserIcon className="w-4 h-4" />
                <span>Sign in</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
            className="md:hidden w-9 h-9 rounded-lg border border-neutral-200 text-charcoal flex items-center justify-center hover:bg-neutral-100"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
        </div>

        {isMobileMenuOpen && (
          <nav id="mobile-navigation" aria-label="Mobile navigation" className="md:hidden border-t border-neutral-100 py-3 animate-slide-down">
            <div className="grid gap-1">
              <button onClick={() => navigateTo('board')} className={`w-full text-left ${navClass('board')}`}>Board</button>
              {hasTeam && (
                <button onClick={() => navigateTo('my-team')} className={`w-full text-left ${navClass('my-team')}`}>My team</button>
              )}
              <button onClick={() => navigateTo('suggestions')} className={`w-full text-left ${navClass('suggestions')}`}>Suggestions</button>
              <button onClick={() => navigateTo('lab')} className={`w-full text-left flex items-center justify-between ${navClass('lab')}`}>
                <span>Race test</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-lime/30 text-charcoal font-bold">50 VUs</span>
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenHelp();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-charcoal"
              >
                Keyboard shortcuts
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}

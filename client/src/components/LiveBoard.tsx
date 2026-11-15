import React from 'react';
import { Search, Plus, KeyRound, Users } from 'lucide-react';
import { Team } from '../types.js';

interface LiveBoardProps {
  teams: Team[];
  isLoading: boolean;
  search: string;
  setSearch: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  selectedSkill: string;
  setSelectedSkill: (s: string) => void;
  onSelectTeam: (teamId: string) => void;
  onRequestJoin: (team: Team) => void;
  onOpenCreateTeam: () => void;
  onOpenJoinCode: () => void;
  onOpenAuth?: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
  currentUserId?: string;
  userTeamId?: string;
}

export function LiveBoard({
  teams,
  isLoading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  selectedSkill,
  setSelectedSkill,
  onSelectTeam,
  onRequestJoin,
  onOpenCreateTeam,
  onOpenJoinCode,
  onOpenAuth,
  hasMore,
  onLoadMore,
  currentUserId,
  userTeamId,
}: LiveBoardProps) {
  const commonSkills = ['React', 'Node', 'Postgres', 'TypeScript', 'Python', 'Rust', 'Go', 'Docker'];

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto py-7 sm:py-10 px-4 sm:px-8">
      {/* Guest Info Banner */}
      {!currentUserId && (
        <div className="bg-charcoal text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-rise-in">
          <div>
            <div className="font-bold text-[15px] flex items-center gap-2">
              <span>Browsing as Guest</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-lime text-charcoal font-bold uppercase">
                50k Participants Ready
              </span>
            </div>
            <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
              Sign in with demo credentials (<span className="font-mono text-white">user00001</span> / <span className="font-mono text-white">Demo@12345</span>) to create teams, accept requests, or take the last seat.
            </p>
          </div>
          {onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className="h-10 px-4 rounded-lg bg-lime hover:bg-lime-dark text-charcoal font-bold text-xs transition-colors shrink-0 shadow-sm"
            >
              Sign in to participate
            </button>
          )}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 animate-rise-in">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted">
            Live team board
          </div>
          <h1 className="text-[2rem] sm:text-4xl font-extrabold tracking-tight text-charcoal leading-tight">
            Find your <span className="bg-lime px-1.5">teammates.</span>
          </h1>
          <div className="text-sm sm:text-[15px] text-muted mt-1">
            Teams with open seats, updated the moment anything changes.
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenJoinCode}
            className="h-11 px-3 sm:px-4 py-0 border border-neutral-300 rounded-xl bg-white text-charcoal font-semibold text-sm sm:text-[15px] hover:border-charcoal hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>Join with code</span>
          </button>
          <button
            onClick={onOpenCreateTeam}
            className="h-11 px-3 sm:px-4 py-0 border-0 rounded-xl bg-lime hover:bg-lime-dark text-charcoal font-bold text-sm sm:text-[15px] transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create team</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_auto_170px_170px] gap-2.5 sm:gap-3 items-center animate-rise-in">
        <div className="min-w-0 relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="q" className="sr-only">Search teams</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            id="q"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams or skills"
            className="w-full h-11 box-border border border-borderMuted rounded-xl pl-10 pr-3.5 text-[15px] text-charcoal bg-white placeholder:text-muted focus:outline-none focus:border-charcoal focus:ring-2 focus:ring-lime/50 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'forming' ? 'all' : 'forming')}
          className={`h-11 px-4 rounded-xl text-sm font-semibold transition-colors border ${
            statusFilter === 'forming'
              ? 'border-lime bg-lime/30 text-charcoal'
              : 'border-borderMuted bg-white text-charcoal hover:border-charcoal'
          }`}
        >
          Open seats only
        </button>

        {/* Skill Filter Dropdown / Pill */}
        <div className="relative min-w-0">
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="w-full h-11 px-4 rounded-xl border border-borderMuted bg-white text-charcoal font-medium text-sm focus:outline-none focus:border-charcoal cursor-pointer"
          >
            <option value="">Skill: any</option>
            {commonSkills.map((sk) => (
              <option key={sk} value={sk}>
                Skill: {sk}
              </option>
            ))}
          </select>
        </div>

        {/* Status Dropdown */}
        <div className="relative min-w-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-11 px-4 rounded-xl border border-borderMuted bg-white text-charcoal font-medium text-sm focus:outline-none focus:border-charcoal cursor-pointer"
          >
            <option value="all">Status: any</option>
            <option value="forming">Status: Forming</option>
            <option value="ready">Status: Ready</option>
            <option value="full">Status: Full</option>
          </select>
        </div>
      </div>

      {/* Team Cards Grid */}
      {teams.length === 0 && !isLoading ? (
        <div className="text-center py-16 sm:py-20 bg-white rounded-2xl border border-cardBorder animate-rise-in">
          <Users className="w-12 h-12 text-muted mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-bold text-charcoal">No teams found</h3>
          <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
            Try adjusting your search criteria or create a new team to begin forming your squad.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((t, index) => {
            const isFull = t.member_count >= t.max_members;
            const isReady = t.member_count >= (t.max_members - 1) && !isFull;
            const isUserInThisTeam = userTeamId === t.id;

            const badgeLabel = isFull ? 'Full' : isReady ? 'Ready' : 'Forming';
            const badgeBg = isFull ? 'bg-neutral-100' : isReady ? 'bg-lime/35' : 'bg-neutral-100';
            const badgeFg = 'text-charcoal';

            return (
              <div
                key={t.id}
                style={{ animationDelay: `${Math.min(index * 70, 350)}ms` }}
                className="group bg-white border border-cardBorder rounded-2xl p-5 flex flex-col justify-between gap-3.5 hover:-translate-y-1 hover:border-neutral-300 hover:shadow-[0_16px_38px_-24px_rgba(23,23,23,0.35)] transition-all animate-rise-in"
              >
                <div className="flex flex-col gap-3">
                  {/* Title & Status Badge */}
                  <div className="flex justify-between items-start gap-2">
                    <h3
                      onClick={() => onSelectTeam(t.id)}
                      className="font-bold text-[18px] text-charcoal cursor-pointer group-hover:underline decoration-lime decoration-2 underline-offset-4 transition-colors truncate flex-1"
                    >
                      {t.name}
                    </h3>
                    <span
                      className={`text-[12px] font-semibold px-2.5 py-1 rounded-[12px] shrink-0 ${badgeBg} ${badgeFg}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-[14px] text-muted leading-[1.45] line-clamp-2 min-h-[40px]">
                    {t.description || 'Building next-gen systems for this hackathon.'}
                  </p>

                  {/* Skills Pills */}
                  <div className="flex gap-1.5 flex-wrap">
                    {t.needed_skills && t.needed_skills.length > 0 ? (
                      t.needed_skills.map((sk) => (
                        <span
                          key={sk}
                          className="text-[13px] px-2.5 py-1 rounded-lg bg-neutral-100 text-charcoal"
                        >
                          {sk}
                        </span>
                      ))
                    ) : (
                      <span className="text-[13px] px-2.5 py-1 rounded-[8px] bg-borderLight text-muted italic">
                        Open to all skills
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  {/* Seats Dots Indicator & Timezone */}
                  <div className="flex items-center justify-between text-[14px] text-[#33373E]">
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: t.max_members }).map((_, i) => (
                        <span
                          key={i}
                          className={`w-3 h-3 rounded-full inline-block transition-colors ${
                            i < t.member_count ? 'bg-charcoal' : 'bg-neutral-200'
                          }`}
                        />
                      ))}
                      <span className="ml-1.5 font-semibold text-[13px] font-mono">
                        {t.member_count} / {t.max_members}
                      </span>
                    </div>

                    <div className="text-[13px] text-muted font-mono">
                      {(t as any).leader_timezone || 'UTC+5:30'}
                    </div>
                  </div>

                  {/* Main Action Button */}
                  {isUserInThisTeam ? (
                    <button
                      onClick={() => onSelectTeam(t.id)}
                      className="w-full h-11 border border-lime rounded-xl bg-lime/30 text-charcoal font-semibold text-[15px]"
                    >
                      Your team · View
                    </button>
                  ) : isFull ? (
                    <button
                      disabled
                      className="w-full h-11 border-0 rounded-[10px] bg-[#E8E6DE] text-muted font-semibold text-[15px] cursor-not-allowed"
                    >
                      Team full
                    </button>
                  ) : (
                    <button
                      onClick={() => onRequestJoin(t)}
                      className="w-full h-11 border-0 rounded-xl bg-charcoal hover:bg-neutral-800 text-white font-semibold text-[15px] transition-colors"
                    >
                      Ask to join
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More Pagination */}
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-6 py-2.5 rounded-[10px] bg-white hover:bg-canvas border border-cardBorder text-sm font-semibold text-charcoal transition-colors"
          >
            {isLoading ? 'Loading teams...' : 'Load more teams'}
          </button>
        </div>
      )}
    </div>
  );
}

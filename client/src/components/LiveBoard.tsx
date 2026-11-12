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
  hasMore,
  onLoadMore,
  currentUserId,
  userTeamId,
}: LiveBoardProps) {
  const commonSkills = ['React', 'Node', 'Postgres', 'TypeScript', 'Python', 'Rust', 'Go', 'Docker'];

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto py-8 px-4 sm:px-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-charcoal">
            Looking for teammates
          </h1>
          <div className="text-[15px] text-muted">
            Teams with open seats, updated the moment anything changes.
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenJoinCode}
            className="h-11 px-4.5 py-0 border border-teal rounded-[10px] bg-white text-teal-dark font-semibold text-[15px] hover:bg-teal-light transition-colors flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4 text-teal" />
            <span>Join with code</span>
          </button>
          <button
            onClick={onOpenCreateTeam}
            className="h-11 px-4.5 py-0 border-0 rounded-[10px] bg-teal hover:bg-teal-hover text-white font-semibold text-[15px] transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create team</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex-1 min-w-[280px] relative">
          <label htmlFor="q" className="sr-only">Search teams</label>
          <input
            id="q"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams or skills   ( press / )"
            className="w-full h-11 box-border border border-borderMuted rounded-[10px] px-3.5 text-[15px] text-charcoal bg-white placeholder:text-muted focus:outline-none focus:border-teal transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'forming' ? 'all' : 'forming')}
          className={`h-11 px-4 rounded-[22px] text-sm font-semibold transition-colors border ${
            statusFilter === 'forming'
              ? 'border-teal bg-teal-light text-teal-dark'
              : 'border-borderMuted bg-white text-[#33373E] hover:border-teal'
          }`}
        >
          Open seats only
        </button>

        {/* Skill Filter Dropdown / Pill */}
        <div className="relative">
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="h-11 px-4 rounded-[22px] border border-borderMuted bg-white text-[#33373E] font-medium text-sm focus:outline-none focus:border-teal cursor-pointer"
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
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-4 rounded-[22px] border border-borderMuted bg-white text-[#33373E] font-medium text-sm focus:outline-none focus:border-teal cursor-pointer"
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
        <div className="text-center py-20 bg-white rounded-2xl border border-cardBorder">
          <Users className="w-12 h-12 text-muted mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-bold text-charcoal">No teams found</h3>
          <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
            Try adjusting your search criteria or create a new team to begin forming your squad.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((t) => {
            const isFull = t.member_count >= t.max_members;
            const isReady = t.member_count >= (t.max_members - 1) && !isFull;
            const isUserInThisTeam = userTeamId === t.id;

            const badgeLabel = isFull ? 'Full' : isReady ? 'Ready' : 'Forming';
            const badgeBg = isFull ? 'bg-[#E8E6DE]' : isReady ? 'bg-[#DCF3E4]' : 'bg-[#FDEBC8]';
            const badgeFg = isFull ? 'text-[#33373E]' : isReady ? 'text-[#14532D]' : 'text-[#7A3E00]';

            return (
              <div
                key={t.id}
                className="bg-white border border-cardBorder rounded-[14px] p-5 flex flex-col justify-between gap-3.5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col gap-3">
                  {/* Title & Status Badge */}
                  <div className="flex justify-between items-start gap-2">
                    <h3
                      onClick={() => onSelectTeam(t.id)}
                      className="font-bold text-[18px] text-charcoal cursor-pointer hover:text-teal transition-colors truncate flex-1"
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
                          className="text-[13px] px-2.5 py-1 rounded-[8px] bg-borderLight text-[#33373E]"
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
                            i < t.member_count ? 'bg-teal' : 'bg-[#D4D1C5]'
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
                      className="w-full h-11 border border-teal rounded-[10px] bg-teal-light text-teal-dark font-semibold text-[15px]"
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
                      className="w-full h-11 border-0 rounded-[10px] bg-teal hover:bg-teal-hover text-white font-semibold text-[15px] transition-colors"
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

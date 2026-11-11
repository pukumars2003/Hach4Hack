import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.js';
import { LiveBoard } from './components/LiveBoard.js';
import { TeamDetail } from './components/TeamDetail.js';
import { ConcurrencyLab } from './components/ConcurrencyLab.js';
import {
  CreateTeamModal,
  JoinCodeModal,
  RequestJoinModal,
  KeyboardHelpModal,
} from './components/Modals.js';
import { AuthModal } from './components/AuthModal.js';
import { useSSE } from './hooks/useSSE.js';
import { api, getAuthToken, clearAuthToken } from './api/client.js';
import { User, Team, TeamDetail as ITeamDetail } from './types.js';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userMembership, setUserMembership] = useState<any>(null);
  const [hackathons, setHackathons] = useState<any[]>([]);
  const [activeHackathonId, setActiveHackathonId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'board' | 'my-team' | 'lab'>('board');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamData, setSelectedTeamData] = useState<ITeamDetail | null>(null);

  // Board state
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [cursor, setCursor] = useState<any>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState<boolean>(false);
  const [isRequestOpen, setIsRequestOpen] = useState<boolean>(false);
  const [targetRequestTeam, setTargetRequestTeam] = useState<Team | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  // Toast / Status notification
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // 1. Initial Load: Check auth & hackathons
  const loadUserAndHackathons = useCallback(async () => {
    try {
      const hList = await api.getHackathons();
      setHackathons(hList);
      if (hList.length > 0) {
        setActiveHackathonId(hList[0].id);
      }

      if (getAuthToken()) {
        const me = await api.getMe();
        setCurrentUser(me.user);
        setUserMembership(me.membership);
      }
    } catch {
      // Not logged in or fresh
    }
  }, []);

  useEffect(() => {
    loadUserAndHackathons();
  }, [loadUserAndHackathons]);

  // 2. Fetch Board Teams
  const fetchTeams = useCallback(async (reset: boolean = true) => {
    if (!activeHackathonId) return;
    setIsLoadingTeams(true);

    try {
      const queryParams: Record<string, any> = {
        hackathonId: activeHackathonId,
        limit: 20,
        search,
        status: statusFilter,
        skill: selectedSkill,
      };

      if (!reset && cursor) {
        queryParams.cursorCreatedAt = cursor.cursorCreatedAt;
        queryParams.cursorId = cursor.cursorId;
      }

      const res = await api.getTeams(queryParams);
      if (reset) {
        setTeams(res.teams);
      } else {
        setTeams((prev) => [...prev, ...res.teams]);
      }
      setHasMore(res.hasMore);
      setCursor(res.nextCursor);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingTeams(false);
    }
  }, [activeHackathonId, search, statusFilter, selectedSkill, cursor]);

  useEffect(() => {
    fetchTeams(true);
  }, [activeHackathonId, search, statusFilter, selectedSkill]);

  // 3. Fetch Selected Team Details
  const fetchSelectedTeam = useCallback(async () => {
    if (!selectedTeamId) return;
    try {
      const data = await api.getTeam(selectedTeamId);
      setSelectedTeamData(data);
    } catch (err: any) {
      showToast(err.message, 'error');
      setSelectedTeamId(null);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    if (selectedTeamId) {
      fetchSelectedTeam();
    } else {
      setSelectedTeamData(null);
    }
  }, [selectedTeamId, fetchSelectedTeam]);

  // 4. Real-time Server-Sent Events (SSE) Listener
  useSSE({
    hackathonId: activeHackathonId,
    teamId: selectedTeamId || undefined,
    onEvent: (event) => {
      // Live refresh board and selected team without manual page reload!
      fetchTeams(true);
      if (selectedTeamId) {
        fetchSelectedTeam();
      }
      if (event.type === 'member_joined') {
        showToast('A new member just joined a team!', 'info');
      }
    },
  });

  // 5. Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing inside form inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      switch (e.key) {
        case 'j':
        case 'J':
          e.preventDefault();
          if (!currentUser) setIsAuthOpen(true);
          else setIsJoinCodeOpen(true);
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          if (!currentUser) setIsAuthOpen(true);
          else if (!userMembership) setIsCreateOpen(true);
          break;
        case '/':
          e.preventDefault();
          document.getElementById('search-input')?.focus();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setActiveTab((prev) => (prev === 'lab' ? 'board' : 'lab'));
          break;
        case '?':
          e.preventDefault();
          setIsHelpOpen(true);
          break;
        case 'Escape':
          e.preventDefault();
          setIsCreateOpen(false);
          setIsJoinCodeOpen(false);
          setIsRequestOpen(false);
          setIsHelpOpen(false);
          setIsAuthOpen(false);
          if (selectedTeamId) setSelectedTeamId(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser, userMembership, selectedTeamId]);

  // Handlers
  const handleLeaveTeam = async () => {
    if (!userMembership) return;
    if (!confirm('Are you sure you want to leave this team?')) return;

    try {
      const res = await api.leaveTeam(userMembership.team_id);
      showToast(res.message, 'success');
      setUserMembership(null);
      setSelectedTeamId(null);
      setActiveTab('board');
      fetchTeams(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
    setUserMembership(null);
    showToast('Logged out successfully.', 'info');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 animate-in slide-in-from-top-4 duration-300">
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2 ${
              notification.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : notification.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Navbar */}
      <Navbar
        currentUser={currentUser}
        onOpenCreateTeam={() => {
          if (!currentUser) setIsAuthOpen(true);
          else setIsCreateOpen(true);
        }}
        onOpenJoinCode={() => {
          if (!currentUser) setIsAuthOpen(true);
          else setIsJoinCodeOpen(true);
        }}
        onToggleLab={() => setActiveTab(activeTab === 'lab' ? 'board' : 'lab')}
        onOpenHelp={() => setIsHelpOpen(true)}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'my-team' && userMembership) {
            setSelectedTeamId(userMembership.team_id);
          } else if (tab === 'board') {
            setSelectedTeamId(null);
          }
        }}
        hasTeam={!!userMembership}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner if not signed in */}
        {!currentUser && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Race-Proof Team Formation Platform</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                  5x Scale Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Guaranteed race-free team formation powered by PostgreSQL row-locking transactions and transactional idempotency.
              </p>
            </div>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors shrink-0"
            >
              Sign In / Register
            </button>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'lab' ? (
          <ConcurrencyLab hackathonId={activeHackathonId} />
        ) : selectedTeamId && selectedTeamData ? (
          <TeamDetail
            team={selectedTeamData}
            currentUser={currentUser}
            onBack={() => {
              setSelectedTeamId(null);
              setActiveTab('board');
            }}
            onRefresh={fetchSelectedTeam}
            onLeaveTeam={handleLeaveTeam}
          />
        ) : (
          <LiveBoard
            teams={teams}
            isLoading={isLoadingTeams}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            selectedSkill={selectedSkill}
            setSelectedSkill={setSelectedSkill}
            onSelectTeam={(teamId) => setSelectedTeamId(teamId)}
            onRequestJoin={(team) => {
              if (!currentUser) return setIsAuthOpen(true);
              setTargetRequestTeam(team);
              setIsRequestOpen(true);
            }}
            hasMore={hasMore}
            onLoadMore={() => fetchTeams(false)}
            currentUserId={currentUser?.id}
            userTeamId={userMembership?.team_id}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-400">
        <div>
          PS1 Concurrency Championship · Built with <span className="text-emerald-400 font-semibold">Fastify</span> + <span className="text-emerald-400 font-semibold">PostgreSQL 16 READ COMMITTED</span> + <span className="text-emerald-400 font-semibold">React 18</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Press <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded font-mono text-slate-200">?</kbd> for keyboard shortcuts · Press <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded font-mono text-slate-200">L</kbd> for Concurrency Stress Lab
        </div>
      </footer>

      {/* Modals */}
      <CreateTeamModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        hackathonId={activeHackathonId}
        onSuccess={(newTeam) => {
          showToast(`Team "${newTeam.name}" created!`, 'success');
          loadUserAndHackathons();
          setSelectedTeamId(newTeam.id);
        }}
      />

      <JoinCodeModal
        isOpen={isJoinCodeOpen}
        onClose={() => setIsJoinCodeOpen(false)}
        onSuccess={(res) => {
          showToast(`Seat claimed on ${res.teamName}!`, 'success');
          loadUserAndHackathons();
          setSelectedTeamId(res.teamId);
        }}
      />

      <RequestJoinModal
        isOpen={isRequestOpen}
        onClose={() => {
          setIsRequestOpen(false);
          setTargetRequestTeam(null);
        }}
        team={targetRequestTeam}
        onSuccess={() => {
          showToast('Join request submitted to team leader.', 'success');
        }}
      />

      <KeyboardHelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          loadUserAndHackathons();
          showToast(`Welcome back, ${user.name}!`, 'success');
        }}
      />
    </div>
  );
}

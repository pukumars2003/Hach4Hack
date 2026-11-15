import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.js';
import { LiveBoard } from './components/LiveBoard.js';
import { TeamDetail } from './components/TeamDetail.js';
import { ConcurrencyLab } from './components/ConcurrencyLab.js';
import { TeammateSuggestions } from './components/TeammateSuggestions.js';
import {
  CreateTeamModal,
  JoinCodeModal,
  RequestJoinModal,
  KeyboardHelpModal,
} from './components/Modals.js';
import { AuthModal } from './components/AuthModal.js';
import { AdminDashboard } from './components/AdminDashboard.js';

import { useSSE } from './hooks/useSSE.js';
import { api, getAuthToken, clearAuthToken } from './api/client.js';
import { User, Team, TeamDetail as ITeamDetail } from './types.js';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userMembership, setUserMembership] = useState<any>(null);
  const [hackathons, setHackathons] = useState<any[]>([]);
  const [activeHackathonId, setActiveHackathonId] = useState<string>('');
  const [view, setView] = useState<'app' | 'admin'>('app');

  const [activeTab, setActiveTab] = useState<'board' | 'my-team' | 'suggestions' | 'lab'>('board');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamData, setSelectedTeamData] = useState<ITeamDetail | null>(null);
  const [freshInvite, setFreshInvite] = useState<{ teamId: string; code: string } | null>(null);

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
  const [notification, setNotification] = useState<{ message: string; type?: 'alert' | 'info' | 'success' } | null>(null);

  const showToast = (message: string, type: 'alert' | 'info' | 'success' = 'info') => {
    setNotification({ message, type });
  };

  const clearFreshInvite = useCallback(() => setFreshInvite(null), []);

  // 1. Initial Load: hackathons + current user (if a token is present)
  const loadUserAndHackathons = useCallback(async () => {
    try {
      const hList = await api.getHackathons();
      setHackathons(hList);
      if (hList.length > 0) {
        setActiveHackathonId(hList[0].id);
      }

      if (getAuthToken()) {
        try {
          const me = await api.getMe();
          setCurrentUser(me.user);
          setUserMembership(me.membership);
        } catch {
          clearAuthToken();
          setCurrentUser(null);
          setUserMembership(null);
        }
      }
    } catch {
      // fresh state
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
      showToast(err.message, 'alert');
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
      fetchTeams(true);
      if (selectedTeamId) {
        fetchSelectedTeam();
      }
      if (event.type === 'member_joined') {
        showToast('A new seat was claimed on the board!', 'info');
      }
    },
  });

  // 5. Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
          document.getElementById('q')?.focus();
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
    const deletesTeam = selectedTeamData?.members.length === 1;
    const confirmation = deletesTeam
      ? 'You are the last member. Leaving will permanently delete this team. Continue?'
      : 'Are you sure you want to leave this team? Leadership will pass to another member if you are the leader.';
    if (!confirm(confirmation)) return;

    try {
      const res = await api.leaveTeam(userMembership.team_id);
      showToast(res.message, 'success');
      setUserMembership(null);
      setFreshInvite(null);
      setSelectedTeamId(null);
      setActiveTab('board');
      fetchTeams(true);
    } catch (err: any) {
      showToast(err.message, 'alert');
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
    setUserMembership(null);
    setView('app');
    showToast('Signed out successfully.', 'info');
  };

  // Admin view is only reachable for an authenticated admin.
  if (view === 'admin' && currentUser?.role === 'admin') {
    return <AdminDashboard onExit={() => setView('app')} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-charcoal font-sans">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-50 bg-[#7A3E00] text-white rounded-xl px-5 py-3.5 text-[15px] font-medium flex items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="h-8.5 px-3.5 border border-[#F5D9B8] rounded-lg bg-transparent text-white font-semibold text-[13px] hover:bg-white/10 transition-colors"
          >
            Dismiss
          </button>
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
        onOpenAuth={() => setIsAuthOpen(true)}
        isAdmin={currentUser?.role === 'admin'}
        onOpenAdmin={() => setView('admin')}
      />

      {/* Main Content */}
      <main className="flex-1 w-full">
        {activeTab === 'lab' ? (
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-8">
            <ConcurrencyLab hackathonId={activeHackathonId} />
          </div>
        ) : activeTab === 'suggestions' ? (
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-8">
            <TeammateSuggestions teamId={userMembership?.team_id} />
          </div>
        ) : selectedTeamId && selectedTeamData?.id === selectedTeamId ? (
          <TeamDetail
            key={selectedTeamId}
            team={selectedTeamData}
            currentUser={currentUser}
            freshInviteCode={freshInvite?.teamId === selectedTeamData.id ? freshInvite.code : null}
            onFreshInviteConsumed={clearFreshInvite}
            onBack={() => {
              setSelectedTeamId(null);
              setFreshInvite(null);
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
            onOpenCreateTeam={() => {
              if (!currentUser) setIsAuthOpen(true);
              else setIsCreateOpen(true);
            }}
            onOpenJoinCode={() => {
              if (!currentUser) setIsAuthOpen(true);
              else setIsJoinCodeOpen(true);
            }}
            hasMore={hasMore}
            onLoadMore={() => fetchTeams(false)}
            currentUserId={currentUser?.id}
            userTeamId={userMembership?.team_id}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-cardBorder py-6 text-center text-xs text-muted mt-auto">
        <div>
          CyberSwaRaksha · Built with <span className="text-teal-dark font-semibold">Fastify</span> + <span className="text-teal-dark font-semibold">PostgreSQL 17 READ COMMITTED</span> + <span className="text-teal-dark font-semibold">React 18</span>
        </div>
        <div className="mt-1 text-[11px] text-muted">
          Press <kbd className="px-1.5 py-0.5 bg-white border border-borderMuted rounded font-mono text-charcoal">?</kbd> for keyboard shortcuts · Press <kbd className="px-1.5 py-0.5 bg-white border border-borderMuted rounded font-mono text-charcoal">/</kbd> to search
        </div>
      </footer>

      {/* Modals */}
      <CreateTeamModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        hackathonId={activeHackathonId}
        onSuccess={async (newTeam) => {
          setFreshInvite(null);
          let inviteCode: string | null = null;
          try {
            const invite = await api.createInvite(newTeam.id);
            inviteCode = invite.code;
            setFreshInvite({ teamId: newTeam.id, code: invite.code });
          } catch (err: any) {
            showToast(`Team created, but invite creation failed: ${err.message}`, 'alert');
          }
          await loadUserAndHackathons();
          setSelectedTeamId(newTeam.id);
          if (inviteCode) {
            showToast(`Team "${newTeam.name}" created. Invite code is ready to share.`, 'success');
          }
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
          showToast('Join request submitted to team leader.', 'info');
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
          setView(user.role === 'admin' ? 'admin' : 'app');
          loadUserAndHackathons();
          showToast(`Signed in as ${user.name}`, 'success');
        }}
      />
    </div>
  );
}
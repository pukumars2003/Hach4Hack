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

  const [activeTab, setActiveTab] = useState<'board' | 'my-team' | 'suggestions' | 'lab'>('board');
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

  // Toast notification
  const [notification, setNotification] = useState<{ message: string; type?: 'alert' | 'info' | 'success' } | null>(null);

  const showToast = (message: string, type: 'alert' | 'info' | 'success' = 'info') => {
    setNotification({ message, type });
  };

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
    setUserMembership(null);
    showToast('Signed out successfully.', 'info');
  };

  // Load hackathons (no auto-login — always require explicit sign-in)
  const loadUserAndHackathons = useCallback(async () => {
    try {
      const hList = await api.getHackathons();
      setHackathons(hList);
      if (hList.length > 0) {
        setActiveHackathonId(hList[0].id);
      }
    } catch {
      // fresh state
    }
  }, []);

  useEffect(() => {
    loadUserAndHackathons();
  }, [loadUserAndHackathons]);

  // Fetch board teams
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

  // Fetch selected team details
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

  // SSE for live updates
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

  // Keyboard shortcuts
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

  const handleLeaveTeam = async () => {
    if (!userMembership) return;
    if (!confirm('Are you sure you want to leave this team?')) return;
    try {
      const res = await api.leaveTeam(userMembership.team_id);
      showToast(res.message, 'info');
      setUserMembership(null);
      setSelectedTeamId(null);
      setActiveTab('board');
      fetchTeams(true);
    } catch (err: any) {
      showToast(err.message, 'alert');
    }
  };

  // ─── Auth gates ──────────────────────────────────────────────
  // 1. No user logged in → show only the login modal
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-canvas">
        <AuthModal
          isOpen={true}
          onClose={() => { }}
          onLoginSuccess={(user: User) => {
            setCurrentUser(user);
            loadUserAndHackathons();
            showToast(`Signed in as ${user.name}`, 'success');
          }}
        />
      </div>
    );
  }

  // 2. Logged-in admin → admin dashboard
  if ((currentUser as any).role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  // 3. Logged-in non-admin → access denied
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="text-center animate-fade-in">
        <div className="w-12 h-12 rounded-xl bg-charcoal text-lime flex items-center justify-center font-extrabold text-lg mx-auto mb-4">
          CS
        </div>
        <h2 className="text-xl font-bold text-charcoal mb-2">Access Restricted</h2>
        <p className="text-sm text-muted mb-6">This dashboard is available to administrators only.</p>
        <button
          onClick={handleLogout}
          className="h-10 px-5 rounded-lg bg-charcoal hover:bg-neutral-800 text-white text-sm font-semibold transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

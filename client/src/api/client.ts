import { User, Team, TeamDetail, Suggestion } from '../types.js';

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('token');
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Auto-generate Idempotency-Key for mutating requests if not provided
  if (['POST', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase() || 'GET')) {
    headers.set('Idempotency-Key', options.idempotencyKey || generateUUID());
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const error: any = new Error(data?.message || 'An error occurred');
    error.status = response.status;
    error.code = data?.code;
    error.data = data;
    throw error;
  }

  return data as T;
}

// Convenience API methods
export const api = {
  // Auth
  register: (body: any) => apiRequest<{ user: User; token: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: any) => apiRequest<{ user: User; token: string }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => apiRequest<{ user: User; membership: any; pendingRequests: any[] }>('/auth/me'),

  // Hackathons
  getHackathons: () => apiRequest<any[]>('/hackathons'),

  // Teams & Board
  getTeams: (query: Record<string, any>) => {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.append(k, String(v));
      }
    });
    return apiRequest<{ teams: Team[]; nextCursor: any; hasMore: boolean }>(`/teams?${searchParams.toString()}`);
  },
  getTeam: (id: string) => apiRequest<TeamDetail>(`/teams/${id}`),
  createTeam: (body: any, idempotencyKey?: string) =>
    apiRequest<Team>('/teams', { method: 'POST', body: JSON.stringify(body), idempotencyKey }),
  joinByCode: (code: string, idempotencyKey?: string) =>
    apiRequest<any>('/teams/join-by-code', { method: 'POST', body: JSON.stringify({ code }), idempotencyKey }),
  leaveTeam: (id: string, idempotencyKey?: string) =>
    apiRequest<any>(`/teams/${id}/leave`, { method: 'POST', idempotencyKey }),
  removeMember: (teamId: string, targetUserId: string) =>
    apiRequest<any>(`/teams/${teamId}/remove-member`, { method: 'POST', body: JSON.stringify({ targetUserId }) }),
  updateTeam: (id: string, body: any) =>
    apiRequest<Team>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Invites
  createInvite: (teamId: string, expiresInHours: number = 24) =>
    apiRequest<{ id: string; code: string; expiresAt: string }>(`/teams/${teamId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ expiresInHours }),
    }),
  revokeInvite: (teamId: string, inviteId: string) =>
    apiRequest<any>(`/teams/${teamId}/invites/${inviteId}`, { method: 'DELETE' }),

  // Requests
  requestToJoin: (teamId: string, message: string = '') =>
    apiRequest<any>('/requests', { method: 'POST', body: JSON.stringify({ teamId, message }) }),
  acceptRequest: (requestId: string) =>
    apiRequest<any>(`/requests/${requestId}/accept`, { method: 'POST' }),
  declineRequest: (requestId: string) =>
    apiRequest<any>(`/requests/${requestId}/decline`, { method: 'POST' }),
  cancelRequest: (requestId: string) =>
    apiRequest<any>(`/requests/${requestId}`, { method: 'DELETE' }),

  // Suggestions
  getSuggestions: (teamId: string) =>
    apiRequest<{ teamId: string; suggestions: Suggestion[] }>(`/teams/${teamId}/suggestions`),

  // Audit Logs
  getAuditLogs: (query: { teamId?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (query.teamId) searchParams.append('teamId', query.teamId);
    if (query.limit) searchParams.append('limit', String(query.limit));
    return apiRequest<{ logs: any[] }>(`/audit?${searchParams.toString()}`);
  },
};


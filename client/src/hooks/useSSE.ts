import { useEffect } from 'react';
import { getAuthToken } from '../api/client.js';

export function useSSE(options: {
  hackathonId?: string;
  teamId?: string;
  onEvent?: (event: any) => void;
}) {
  const { hackathonId, teamId, onEvent } = options;

  useEffect(() => {
    if (!hackathonId) return;

    const token = getAuthToken() || '';
    const url = new URL('/api/realtime/stream', window.location.origin);
    url.searchParams.append('hackathonId', hackathonId);
    if (teamId) url.searchParams.append('teamId', teamId);
    if (token) url.searchParams.append('token', token);

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener('team_event', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (onEvent) {
          onEvent(payload);
        }
      } catch (err) {
        console.error('[SSE Hook] Failed to parse message', err);
      }
    });

    eventSource.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      eventSource.close();
    };
  }, [hackathonId, teamId, onEvent]);
}


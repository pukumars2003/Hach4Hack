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
    const origin = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    const url = new URL('/api/realtime/stream', origin);
    url.searchParams.append('hackathonId', hackathonId);
    if (teamId) url.searchParams.append('teamId', teamId);
    let stopped = false;
    let controller: AbortController | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let resolveReconnect: (() => void) | undefined;
    let retryDelayMs = 1000;

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const response = await fetch(url.toString(), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            if (response.status === 401 || response.status === 403) {
              console.error(`[SSE Hook] Subscription rejected (${response.status}).`);
              return;
            }
            throw new Error(`SSE request failed with status ${response.status}.`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
              const block = buffer.slice(0, boundary).replace(/\r/g, '');
              buffer = buffer.slice(boundary + 2);
              const lines = block.split('\n');
              const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
              const data = lines.filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trim())
                .join('\n');
              if (eventName === 'team_event' && data && onEvent) {
                onEvent(JSON.parse(data));
              }
              boundary = buffer.indexOf('\n\n');
            }
          }
          retryDelayMs = 1000;
        } catch (error) {
          if (stopped || controller.signal.aborted) return;
          console.error('[SSE Hook] Connection interrupted; reconnecting.', error);
        }

        if (!stopped) {
          await new Promise<void>((resolve) => {
            resolveReconnect = resolve;
            reconnectTimer = setTimeout(() => {
              resolveReconnect = undefined;
              resolve();
            }, retryDelayMs);
          });
          retryDelayMs = Math.min(retryDelayMs * 2, 30000);
        }
      }
    };

    connect().catch((error) => console.error('[SSE Hook] Stream failed.', error));

    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      resolveReconnect?.();
      resolveReconnect = undefined;
    };
  }, [hackathonId, teamId, onEvent]);
}


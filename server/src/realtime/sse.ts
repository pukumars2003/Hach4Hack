import { FastifyReply } from 'fastify';
import pg from 'pg';
import { createDedicatedClient } from '../db/pool.js';

export interface TeamEventPayload {
  type: string;
  teamId?: string;
  hackathonId?: string;
  userId?: string;
  actorId?: string;
}

interface TeamSubscriber {
  reply: FastifyReply;
  userId: string;
}

class RealtimeHub {
  private boardSubscribers: Map<string, Set<FastifyReply>> = new Map();
  private teamSubscribers: Map<string, Set<TeamSubscriber>> = new Map();
  private listenerClient: pg.Client | null = null;
  private isConnecting: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  public async startListener() {
    if (this.listenerClient || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.listenerClient = createDedicatedClient();
      await this.listenerClient.connect();

      this.listenerClient.on('notification', (msg) => {
        if (msg.channel === 'team_events' && msg.payload) {
          try {
            const data: TeamEventPayload = JSON.parse(msg.payload);
            this.handleDatabaseNotification(data);
          } catch (err) {
            console.error('[SSE Hub] Failed to parse pg_notify payload:', msg.payload, err);
          }
        }
      });

      this.listenerClient.on('error', (err) => {
        console.error('[SSE Hub] Dedicated listener connection error:', err);
        this.reconnect();
      });

      await this.listenerClient.query('LISTEN team_events;');
      console.log('[SSE Hub] Dedicated LISTEN connection active on channel "team_events"');
    } catch (err) {
      console.error('[SSE Hub] Failed to establish LISTEN connection:', err);
      this.reconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private reconnect() {
    if (this.listenerClient) {
      try {
        this.listenerClient.end().catch(() => {});
      } catch {}
      this.listenerClient = null;
    }
    // Broadcast resync to all connected SSE clients so they refetch current data
    this.broadcastToAll({ type: 'resync' });

    setTimeout(() => {
      this.startListener().catch(() => {});
    }, 2000);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      // 15s keep-alive comment for proxies
      const comment = ': heartbeat\n\n';
      for (const subscribers of this.boardSubscribers.values()) {
        for (const reply of subscribers) {
          try {
            reply.raw.write(comment);
          } catch {}
        }
      }
      for (const subscribers of this.teamSubscribers.values()) {
        for (const sub of subscribers) {
          try {
            sub.reply.raw.write(comment);
          } catch {}
        }
      }
    }, 15000);
  }

  public subscribeBoard(hackathonId: string, reply: FastifyReply) {
    if (!this.boardSubscribers.has(hackathonId)) {
      this.boardSubscribers.set(hackathonId, new Set());
    }
    this.boardSubscribers.get(hackathonId)!.add(reply);

    reply.raw.on('close', () => {
      const subs = this.boardSubscribers.get(hackathonId);
      if (subs) {
        subs.delete(reply);
        if (subs.size === 0) this.boardSubscribers.delete(hackathonId);
      }
    });
  }

  public subscribeTeam(teamId: string, userId: string, reply: FastifyReply) {
    if (!this.teamSubscribers.has(teamId)) {
      this.teamSubscribers.set(teamId, new Set());
    }
    const subscriber: TeamSubscriber = { reply, userId };
    this.teamSubscribers.get(teamId)!.add(subscriber);

    reply.raw.on('close', () => {
      const subs = this.teamSubscribers.get(teamId);
      if (subs) {
        subs.delete(subscriber);
        if (subs.size === 0) this.teamSubscribers.delete(teamId);
      }
    });
  }

  private handleDatabaseNotification(payload: TeamEventPayload) {
    const sseMessage = `event: team_event\ndata: ${JSON.stringify(payload)}\n\n`;

    // 1. Broadcast to board listeners if hackathonId is present
    if (payload.hackathonId && this.boardSubscribers.has(payload.hackathonId)) {
      const subscribers = this.boardSubscribers.get(payload.hackathonId)!;
      for (const reply of subscribers) {
        try {
          reply.raw.write(sseMessage);
        } catch {}
      }
    }

    // 2. Broadcast to specific team channel
    if (payload.teamId && this.teamSubscribers.has(payload.teamId)) {
      const subscribers = this.teamSubscribers.get(payload.teamId)!;
      for (const sub of subscribers) {
        try {
          sub.reply.raw.write(sseMessage);
        } catch {}
      }
    }
  }

  public broadcastToAll(payload: any) {
    const sseMessage = `event: team_event\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const subscribers of this.boardSubscribers.values()) {
      for (const reply of subscribers) {
        try {
          reply.raw.write(sseMessage);
        } catch {}
      }
    }
    for (const subscribers of this.teamSubscribers.values()) {
      for (const sub of subscribers) {
        try {
          sub.reply.raw.write(sseMessage);
        } catch {}
      }
    }
  }

  public destroy() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.listenerClient) {
      this.listenerClient.end().catch(() => {});
    }
  }
}

export const realtimeHub = new RealtimeHub();


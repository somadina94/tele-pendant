import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { corsOriginDelegate } from '../common/cors-origins';
import { ACCESS_TOKEN_COOKIE } from '../common/constants';
import { motionDebug } from '../common/motion-debug';
import { AuthService, JwtPayload } from '../auth/providers/auth.service';
import { SafetyStateService } from '../safety/providers/safety-state.service';

@WebSocketGateway({
  // TP-44: same allowlist as HTTP CORS (FRONTEND_URL + localhost in dev).
  cors: { origin: corsOriginDelegate, credentials: true },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(SafetyStateService)
    private readonly safetyState: SafetyStateService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  broadcast(event: string, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  /**
   * TP-37: reject anonymous sockets before they receive tags or can pulse.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new Error('missing token');
      }
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('appConfig.jwt.secret'),
        audience: this.configService.get<string>('appConfig.jwt.audience'),
        issuer: this.configService.get<string>('appConfig.jwt.issuer'),
      });
      if (!payload?.sub) {
        throw new Error('invalid payload');
      }
      // TP-40: signature alone is not enough — reject suspended/deleted/revoked.
      const session = await this.authService.assertActiveSession(payload);
      this.setUser(client, session);
      motionDebug('ws.connect', {
        socketId: client.id,
        userId: session.sub,
        transport: (
          client.conn as { transport?: { name?: string } } | undefined
        )?.transport?.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unauthorized';
      this.logger.warn(`Realtime reject ${client.id}: ${message}`);
      client.disconnect(true);
    }
  }

  /**
   * Link flap mid-hold: unbind this socket only. Do not clear motion coils —
   * HTTP deadman pulses + deadmanTimeoutMs cover a true drop (avoids prod stutter
   * when Socket.IO reconnects through the proxy).
   */
  handleDisconnect(client: Socket) {
    const snap = this.safetyState.snapshot();
    motionDebug('ws.disconnect', {
      socketId: client.id,
      deadmanActive: snap.deadmanActive,
      lastClientPulseAt: snap.lastClientPulseAt,
    });
    this.logger.warn(
      `Realtime disconnect ${client.id}; clearing socket deadman binding if any`,
    );
    this.safetyState.noteSocketDisconnect(client.id);
  }

  @SubscribeMessage('deadman.pulse')
  handleDeadmanPulse(@ConnectedSocket() client: Socket) {
    const user = this.userOf(client);
    if (!user?.sub) {
      motionDebug('ws.deadman.pulse.ignored', {
        socketId: client.id,
        reason: 'no-user',
      });
      return this.safetyState.snapshot();
    }
    this.safetyState.pulseDeadman({
      userId: user.sub,
      socketId: client.id,
    });
    const snap = this.safetyState.snapshot();
    motionDebug('ws.deadman.pulse', {
      socketId: client.id,
      userId: user.sub,
      deadmanActive: snap.deadmanActive,
      lastClientPulseAt: snap.lastClientPulseAt,
      transport: (
        client.conn as { transport?: { name?: string } } | undefined
      )?.transport?.name,
    });
    return snap;
  }

  @SubscribeMessage('deadman.release')
  async handleDeadmanRelease(@ConnectedSocket() client: Socket) {
    const user = this.userOf(client);
    motionDebug('ws.deadman.release', {
      socketId: client.id,
      userId: user?.sub ?? null,
    });
    return this.safetyState.releaseDeadman({
      userId: user?.sub,
      socketId: client.id,
    });
  }

  @SubscribeMessage('safety.get')
  handleSafetyGet() {
    return this.safetyState.snapshot();
  }

  private setUser(client: Socket, user: JwtPayload): void {
    const data = client.data as { user?: JwtPayload };
    data.user = user;
  }

  private userOf(client: Socket): JwtPayload | undefined {
    const data = client.data as { user?: JwtPayload };
    return data.user;
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown };
    if (typeof auth?.token === 'string' && auth.token.trim()) {
      return auth.token.trim();
    }
    const header = client.handshake.headers.authorization;
    if (
      typeof header === 'string' &&
      header.toLowerCase().startsWith('bearer ')
    ) {
      return header.slice(7).trim() || null;
    }
    const cookieHeader = client.handshake.headers.cookie;
    if (typeof cookieHeader === 'string') {
      for (const part of cookieHeader.split(';')) {
        const [rawKey, ...rest] = part.trim().split('=');
        if (rawKey === ACCESS_TOKEN_COOKIE) {
          const value = rest.join('=').trim();
          return value ? decodeURIComponent(value) : null;
        }
      }
    }
    return null;
  }
}

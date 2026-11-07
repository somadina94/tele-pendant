import { Inject } from '@nestjs/common';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { SafetyStateService } from '../safety/providers/safety-state.service';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(SafetyStateService)
    private readonly safetyState: SafetyStateService,
  ) {}

  broadcast(event: string, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  @SubscribeMessage('deadman.pulse')
  handleDeadmanPulse() {
    this.safetyState.pulseDeadman();
    return this.safetyState.snapshot();
  }

  @SubscribeMessage('deadman.release')
  async handleDeadmanRelease() {
    return this.safetyState.releaseDeadman();
  }

  @SubscribeMessage('safety.get')
  handleSafetyGet() {
    return this.safetyState.snapshot();
  }
}

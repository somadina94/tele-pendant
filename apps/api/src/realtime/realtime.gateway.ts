import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SafetyStateService } from '../safety/providers/safety-state.service';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(SafetyStateService)
    private readonly safetyState: SafetyStateService,
  ) {}

  broadcast(event: string, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  /**
   * Link drop mid-hold: clear deadman + motion coils immediately instead of
   * waiting for the ~1.5s pulse timeout. Keep the timeout as a second layer.
   */
  handleDisconnect(client: Socket) {
    this.logger.warn(
      `Realtime disconnect ${client.id}; dropping deadman and motion coils`,
    );
    void this.safetyState.releaseDeadman();
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

import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/providers/audit.service';
import { HmiService } from '../../hmi/providers/hmi.service';
import { SafetyStateService } from '../../safety/providers/safety-state.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { ScanCode } from '../entities/scan-code.entity';

const VOICE_ALIASES: Record<string, string> = {
  'hoist up': 'Hoist Up',
  'hoist down': 'Hoist Down',
  'trolley left': 'Trolley L',
  'trolley right': 'Trolley R',
  stop: 'STOP',
  'emergency stop': 'STOP',
};

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly codes: Repository<ScanCode>;
  private readonly hmiService: HmiService;
  private readonly safetyState: SafetyStateService;
  private readonly auditService: AuditService;

  constructor(
    @InjectRepository(ScanCode)
    codes: Repository<ScanCode>,
    @Inject(HmiService) hmiService: HmiService,
    @Inject(SafetyStateService) safetyState: SafetyStateService,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.codes = codes;
    this.hmiService = hmiService;
    this.safetyState = safetyState;
    this.auditService = auditService;
  }

  async onModuleInit(): Promise<void> {
    if ((await this.codes.count()) > 0) return;
    await this.codes.save([
      this.codes.create({
        code: 'TP-CRANE-DEMO-01',
        label: 'Demo crane bay A',
        kind: 'asset',
        routeHint: '/operator',
        notes: 'Seed QR for simulator acceptance tests',
      }),
      this.codes.create({
        code: 'TP-OPS',
        label: 'Ops dashboard',
        kind: 'shortcut',
        routeHint: '/ops',
      }),
    ]);
  }

  async resolveCode(code: string) {
    const row = await this.codes.findOne({ where: { code: code.trim() } });
    if (!row) {
      throw new NotFoundException(`Unknown code: ${code}`);
    }
    return row;
  }

  listCodes() {
    return this.codes.find({ order: { label: 'ASC' } });
  }

  /**
   * Map a spoken phrase to an allowlisted cell label and activate it.
   */
  async voiceCommand(
    transcript: string,
    opts: {
      userId?: string;
      userEmail?: string;
      role?: UserRole;
      ip?: string;
      safeActionPin?: string;
    },
  ) {
    const normalized = transcript.trim().toLowerCase();
    const label =
      VOICE_ALIASES[normalized] ??
      Object.entries(VOICE_ALIASES).find(([k]) => normalized.includes(k))?.[1];

    if (!label) {
      return { ok: false, reason: 'command_not_allowlisted', transcript };
    }

    const layout = await this.hmiService.getLayout();
    const cell = layout.cells.find(
      (c) => c.label.toLowerCase() === label.toLowerCase(),
    );
    if (!cell) {
      return { ok: false, reason: 'cell_not_found', transcript, label };
    }

    if (cell.isMotion) {
      this.safetyState.pulseDeadman();
    }

    await this.hmiService.activateCell(cell.id, true, {
      userId: opts.userId,
      userEmail: opts.userEmail,
      role: opts.role,
      safeActionPin: opts.safeActionPin,
      ip: opts.ip,
    });

    await this.auditService.write({
      userId: opts.userId,
      userEmail: opts.userEmail,
      action: 'voice.command',
      resource: cell.id,
      details: transcript,
      ip: opts.ip,
      result: 'success',
    });

    return { ok: true, cellId: cell.id, label, transcript };
  }

  cameraConfig() {
    return {
      deviceCameraEnabled: true,
      rtspUrl: process.env.CAMERA_RTSP_URL || null,
      notes:
        'Browser/device camera for demo. Set CAMERA_RTSP_URL for plant CCTV later.',
    };
  }
}

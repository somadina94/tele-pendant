import {
  BadRequestException,
  ConflictException,
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
import { matchVoiceCommand } from './voice-match';

/** How long a spoken motion command stays asserted. */
const VOICE_JOG_MS = 2500;
const VOICE_JOG_PULSE_MS = 400;

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly codes: Repository<ScanCode>;
  private readonly hmiService: HmiService;
  private readonly safetyState: SafetyStateService;
  private readonly auditService: AuditService;
  private motionJog: ReturnType<typeof setInterval> | null = null;

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

  async saveCode(input: {
    id?: string;
    code: string;
    label: string;
    kind?: string;
    routeHint?: string | null;
    notes?: string | null;
  }): Promise<ScanCode> {
    const code = input.code.trim();
    const label = input.label.trim();
    if (!code || !label) {
      throw new BadRequestException('Code and label are required');
    }
    const routeHint = input.routeHint?.trim() || null;
    if (routeHint && !routeHint.startsWith('/')) {
      throw new BadRequestException('Route hint must start with /');
    }

    let row: ScanCode;
    if (input.id) {
      const existing = await this.codes.findOneBy({ id: input.id });
      if (!existing) throw new NotFoundException('Scan code not found');
      row = existing;
    } else {
      row = this.codes.create({});
    }

    const duplicate = await this.codes.findOne({ where: { code } });
    if (duplicate && duplicate.id !== row.id) {
      throw new ConflictException('A code with that payload already exists');
    }

    row.code = code;
    row.label = label;
    row.kind = input.kind?.trim() || 'asset';
    row.routeHint = routeHint;
    row.notes = input.notes?.trim() || null;
    return this.codes.save(row);
  }

  async deleteCode(id: string): Promise<void> {
    const row = await this.codes.findOneBy({ id });
    if (!row) throw new NotFoundException('Scan code not found');
    await this.codes.remove(row);
  }

  /**
   * Map a spoken phrase to an allowlisted cell label and activate it.
   */
  async voiceCommand(
    transcript: string,
    opts: {
      userId?: string;
      userEmail?: string;
      userDisplayName?: string | null;
      role?: UserRole;
      ip?: string;
      safeActionPin?: string;
      alternatives?: string[];
    },
  ) {
    const phrases = [transcript, ...(opts.alternatives ?? [])]
      .map((phrase) => phrase.trim())
      .filter((phrase) => phrase.length > 0);
    let label: string | null = null;
    let heard = transcript;
    for (const phrase of phrases) {
      const hit = matchVoiceCommand(phrase);
      if (!hit) continue;
      label = hit;
      heard = phrase;
      break;
    }

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
      const allowed = await this.safetyState.allowTimedMediaMotion();
      if (!allowed) {
        return {
          ok: false,
          reason: 'timed_motion_disabled',
          transcript: heard,
          label,
          message:
            'Timed motion is off. Hold the button on Operator, or turn on Allow timed media motion in Config.',
        };
      }
      this.beginMotionJog(cell.id);
      const otherLabel =
        label === 'Hoist Up'
          ? 'Hoist Down'
          : label === 'Hoist Down'
            ? 'Hoist Up'
            : null;
      const other = otherLabel
        ? layout.cells.find((item) => item.label === otherLabel)
        : undefined;
      if (other) {
        try {
          await this.hmiService.activateCell(other.id, false, {
            userId: opts.userId,
            userEmail: opts.userEmail,
            userDisplayName: opts.userDisplayName,
            role: opts.role,
            safeActionPin: opts.safeActionPin,
            ip: opts.ip,
          });
        } catch {
          // The previous direction coil is cleared on a best-effort basis.
        }
      }
    }

    await this.hmiService.activateCell(cell.id, true, {
      userId: opts.userId,
      userEmail: opts.userEmail,
      userDisplayName: opts.userDisplayName,
      role: opts.role,
      safeActionPin: opts.safeActionPin,
      ip: opts.ip,
    });

    await this.auditService.write({
      userId: opts.userId,
      userEmail: opts.userEmail,
      userDisplayName: opts.userDisplayName ?? null,
      action: 'voice.command',
      resource: cell.label,
      details: heard,
      ip: opts.ip,
      result: 'success',
    });

    return {
      ok: true,
      cellId: cell.id,
      label,
      transcript: heard,
      message: cell.requiresSafeAction
        ? `Crane commanded to stop (${label}).`
        : undefined,
    };
  }

  /** Hold deadman for a short jog, then drop the motion coil. */
  private beginMotionJog(cellId: string): void {
    this.endMotionJog(null);
    const started = Date.now();
    this.safetyState.pulseDeadman();
    this.motionJog = setInterval(() => {
      if (Date.now() - started >= VOICE_JOG_MS) {
        this.endMotionJog(cellId);
        return;
      }
      this.safetyState.pulseDeadman();
    }, VOICE_JOG_PULSE_MS);
    this.motionJog.unref();
  }

  private endMotionJog(cellId: string | null): void {
    if (this.motionJog) {
      clearInterval(this.motionJog);
      this.motionJog = null;
    }
    if (!cellId) return;
    void this.clearMotionCoil(cellId);
  }

  private async clearMotionCoil(cellId: string): Promise<void> {
    try {
      await this.hmiService.activateCell(cellId, false, {});
    } catch {
      // Deadman expiry also clears motion coils.
    }
    this.safetyState.releaseDeadman();
  }

  cameraConfig() {
    return {
      deviceCameraEnabled: true,
      rtspUrl: process.env.CAMERA_RTSP_URL || null,
      notes:
        'This screen uses the device camera. A plant camera can be connected later by an administrator.',
    };
  }
}

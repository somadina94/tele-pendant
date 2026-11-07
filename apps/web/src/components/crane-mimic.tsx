import { resolveCraneMimicView, type TagSnapshot } from '@tele-pendant/shared';
import { cn } from '@/lib/utils';

type SafetyLike = {
  mode?: string;
  eStopActive?: boolean;
  watchdogOk?: boolean;
  deadmanActive?: boolean;
};

const MOTOR_FILL = {
  idle: '#8a9bab',
  run: '#6ec4a3',
  fault: '#e07a88',
} as const;

const SAFETY_STROKE = {
  ok: 'rgba(160, 220, 200, 0.75)',
  warn: 'rgba(252, 211, 77, 0.85)',
  danger: 'rgba(251, 113, 133, 0.95)',
} as const;

/**
 * FEAT-HMI phase 1: ISA-101-ish muted SVG crane mimic driven by live tags.
 * Uses SVG transform attributes (not CSS) so the trolley/hook stay in viewBox.
 */
export function CraneMimic({
  tags,
  safety,
  className,
}: {
  tags: TagSnapshot | null;
  safety?: SafetyLike | null;
  className?: string;
}) {
  const view = resolveCraneMimicView({ tags, safety });
  const bridgeY = 28;
  const railLeft = 36;
  const railRight = 364;
  const railWidth = railRight - railLeft;
  const trolleyX = railLeft + view.trolleyPct * railWidth;
  const hookMinY = 46;
  const hookMaxY = 118;
  const hookY = hookMaxY - view.hoistPct * (hookMaxY - hookMinY);
  const ropeLen = Math.max(8, hookY - (bridgeY + 14));
  const motorFill = MOTOR_FILL[view.motorTone];
  const frameStroke = SAFETY_STROKE[view.safetyTone];
  const loadWidth = Math.max(2, view.loadPct * 56);

  return (
    <svg
      className={cn('crane-mimic', className)}
      viewBox="0 0 400 140"
      role="img"
      aria-label="Crane mimic"
      data-feat="hmi-mimic"
      data-motor={view.motorTone}
      data-safety={view.safetyTone}
    >
      {/* Bay / deck */}
      <rect
        x="18"
        y="122"
        width="364"
        height="10"
        rx="2"
        fill="rgba(180,195,210,0.2)"
        stroke="rgba(220,230,240,0.35)"
        strokeWidth="1"
      />

      {/* Columns */}
      <rect x="28" y="24" width="8" height="98" fill="#7a8794" />
      <rect x="364" y="24" width="8" height="98" fill="#7a8794" />

      {/* Bridge beam */}
      <rect
        x="28"
        y={bridgeY}
        width="344"
        height="10"
        rx="2"
        fill="#9aa6b2"
        stroke={frameStroke}
        strokeWidth="1.5"
      />
      <line
        x1="36"
        y1={bridgeY + 14}
        x2="364"
        y2={bridgeY + 14}
        stroke="rgba(230,238,245,0.55)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Trolley + motor + hook */}
      <g transform={`translate(${trolleyX} ${bridgeY + 8})`}>
        <rect
          x="-18"
          y="0"
          width="36"
          height="14"
          rx="2"
          fill="#b0bcc8"
          stroke="rgba(255,255,255,0.35)"
        />
        <rect
          x="-10"
          y="3"
          width="20"
          height="8"
          rx="1.5"
          fill={motorFill}
          className={cn(view.motorTone === 'run' && 'crane-mimic-motor-run')}
        />
        <line
          x1="0"
          y1="14"
          x2="0"
          y2={14 + ropeLen}
          stroke="rgba(235,242,250,0.9)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <g transform={`translate(0 ${14 + ropeLen})`}>
          <path
            d="M-7 0 L7 0 L4 10 L-4 10 Z"
            fill="#c5d0db"
            stroke="rgba(255,255,255,0.35)"
          />
          <rect
            x="-8"
            y="10"
            width="16"
            height="8"
            rx="1"
            fill={view.loadPct > 0.05 ? '#d0dae4' : '#8a96a2'}
          />
        </g>
      </g>

      {/* Load bar + motor legend */}
      <g transform="translate(48 8)">
        <text
          x="0"
          y="0"
          fill="rgba(255,255,255,0.55)"
          fontSize="8"
          letterSpacing="1.6"
        >
          LOAD
        </text>
        <rect
          x="0"
          y="4"
          width="56"
          height="5"
          rx="1"
          fill="rgba(255,255,255,0.12)"
        />
        <rect
          x="0"
          y="4"
          width={loadWidth}
          height="5"
          rx="1"
          fill={
            view.loadPct > 0.85
              ? '#e07a88'
              : view.loadPct > 0.55
                ? '#d4b03a'
                : '#6ec4a3'
          }
        />
      </g>

      <g transform="translate(300 10)">
        <circle cx="0" cy="0" r="4" fill={motorFill} />
        <text
          x="8"
          y="3"
          fill="rgba(255,255,255,0.8)"
          fontSize="9"
          letterSpacing="1.2"
        >
          {view.motorTone === 'run'
            ? 'MOTOR RUN'
            : view.motorTone === 'fault'
              ? 'MOTOR FAULT'
              : 'MOTOR IDLE'}
        </text>
      </g>

      {view.safetyTone !== 'ok' ? (
        <g transform="translate(160 10)">
          <rect
            x="0"
            y="-8"
            width={view.safetyTone === 'danger' ? 78 : 70}
            height="14"
            rx="7"
            fill={
              view.safetyTone === 'danger'
                ? 'rgba(196,91,106,0.45)'
                : 'rgba(201,162,39,0.4)'
            }
            stroke={frameStroke}
          />
          <text
            x="8"
            y="2"
            fill="rgba(255,255,255,0.95)"
            fontSize="8"
            letterSpacing="1.4"
          >
            {view.safetyTone === 'danger' ? 'SAFETY STOP' : 'SAFETY WARN'}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

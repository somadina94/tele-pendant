import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { resolveCraneMimicView, type TagSnapshot } from '@tele-pendant/shared';

type SafetyLike = {
  mode?: string;
  eStopActive?: boolean;
  watchdogOk?: boolean;
};

const MOTOR_FILL = {
  idle: '#6b7c8a',
  run: '#5a9e86',
  fault: '#c45b6a',
} as const;

const SAFETY_STROKE = {
  ok: 'rgba(143, 208, 192, 0.55)',
  warn: 'rgba(252, 211, 77, 0.65)',
  danger: 'rgba(251, 113, 133, 0.8)',
} as const;

/** FEAT-HMI phase 1: muted SVG crane mimic for Operator. */
export function CraneMimic({
  tags,
  safety,
}: {
  tags: TagSnapshot | null;
  safety?: SafetyLike | null;
}) {
  const view = resolveCraneMimicView({ tags, safety });
  const bridgeY = 28;
  const railLeft = 36;
  const railRight = 364;
  const trolleyX = railLeft + view.trolleyPct * (railRight - railLeft);
  const hookMinY = 46;
  const hookMaxY = 108;
  const hookY = hookMaxY - view.hoistPct * (hookMaxY - hookMinY);
  const motorFill = MOTOR_FILL[view.motorTone];
  const frameStroke = SAFETY_STROKE[view.safetyTone];
  const loadWidth = Math.max(2, view.loadPct * 56);
  const ropeLen = hookY - (bridgeY + 8);

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 130"
      accessibilityLabel="Crane mimic"
    >
      <Rect x="18" y="118" width="364" height="8" rx="2" fill="#2a3138" />
      <Rect x="28" y="24" width="8" height="94" fill="#3d4650" />
      <Rect x="364" y="24" width="8" height="94" fill="#3d4650" />
      <Rect
        x="28"
        y={bridgeY}
        width="344"
        height="10"
        rx="2"
        fill="#4a5560"
        stroke={frameStroke}
        strokeWidth="1.5"
      />
      <Line
        x1="36"
        y1={bridgeY + 14}
        x2="364"
        y2={bridgeY + 14}
        stroke="rgba(210,220,230,0.35)"
        strokeWidth="1.5"
      />

      <G transform={`translate(${trolleyX}, ${bridgeY + 8})`}>
        <Rect
          x={-18}
          y={0}
          width={36}
          height={14}
          rx={2}
          fill="#5c6772"
          stroke="rgba(255,255,255,0.18)"
        />
        <Rect x={-10} y={3} width={20} height={8} rx={1.5} fill={motorFill} />
        <Line
          x1={0}
          y1={14}
          x2={0}
          y2={14 + ropeLen}
          stroke="rgba(220,228,235,0.7)"
          strokeWidth="1.5"
        />
        <G transform={`translate(0, ${ropeLen})`}>
          <Path
            d="M-7 0 L7 0 L4 10 L-4 10 Z"
            fill="#6a7380"
            stroke="rgba(255,255,255,0.2)"
          />
          <Rect
            x={-8}
            y={10}
            width={16}
            height={8}
            rx={1}
            fill={view.loadPct > 0.05 ? '#7a8694' : '#4e5762'}
          />
        </G>
      </G>

      <SvgText
        x="48"
        y="10"
        fill="rgba(255,255,255,0.45)"
        fontSize="8"
        letterSpacing="1.4"
      >
        LOAD
      </SvgText>
      <Rect
        x="48"
        y="14"
        width="56"
        height="5"
        rx="1"
        fill="rgba(255,255,255,0.08)"
      />
      <Rect
        x="48"
        y="14"
        width={loadWidth}
        height="5"
        rx="1"
        fill={
          view.loadPct > 0.85
            ? '#c45b6a'
            : view.loadPct > 0.55
              ? '#c9a227'
              : '#5a9e86'
        }
      />

      <Circle cx="308" cy="12" r="4" fill={motorFill} />
      <SvgText x="316" y="15" fill="rgba(255,255,255,0.7)" fontSize="9">
        {view.motorTone === 'run'
          ? 'MOTOR RUN'
          : view.motorTone === 'fault'
            ? 'MOTOR FAULT'
            : 'MOTOR IDLE'}
      </SvgText>

      {view.safetyTone !== 'ok' ? (
        <G>
          <Rect
            x="150"
            y="4"
            width={view.safetyTone === 'danger' ? 78 : 70}
            height="14"
            rx="7"
            fill={
              view.safetyTone === 'danger'
                ? 'rgba(196,91,106,0.35)'
                : 'rgba(201,162,39,0.3)'
            }
            stroke={frameStroke}
          />
          <SvgText x="158" y="14" fill="rgba(255,255,255,0.9)" fontSize="8">
            {view.safetyTone === 'danger' ? 'SAFETY STOP' : 'SAFETY WARN'}
          </SvgText>
        </G>
      ) : null}
    </Svg>
  );
}

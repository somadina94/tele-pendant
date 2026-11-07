/** Native RN colors — do not use CSS vars; NativeWind does not resolve them on Pressable. */

export const ESTOP = {
  background: '#e10600',
  border: '#e10600',
  foreground: '#ffffff',
} as const;

export const operatorCell = (dark: boolean) =>
  dark
    ? {
        background: '#1c3a5c',
        border: '#2f6aa8',
        foreground: '#e8eef4',
        meta: '#8b9aab',
      }
    : {
        background: '#dbeafe',
        border: '#93c5fd',
        foreground: '#0f1419',
        meta: '#5c6b7a',
      };

/** FEAT-A1 matrix states — pair with text chip (colour-blind safe). */
export const matrixCellStatePalette = (
  dark: boolean,
): Record<
  'idle' | 'running' | 'blocked' | 'fault',
  { background: string; border: string; foreground: string; chip: string }
> =>
  dark
    ? {
        idle: {
          background: '#1e293b',
          border: '#475569',
          foreground: '#e2e8f0',
          chip: 'rgba(255,255,255,0.12)',
        },
        running: {
          background: '#14532d',
          border: '#22c55e',
          foreground: '#86efac',
          chip: 'rgba(0,0,0,0.25)',
        },
        blocked: {
          background: '#78350f',
          border: '#f59e0b',
          foreground: '#fcd34d',
          chip: 'rgba(0,0,0,0.25)',
        },
        fault: {
          background: '#4c1d95',
          border: '#a855f7',
          foreground: '#e9d5ff',
          chip: 'rgba(0,0,0,0.25)',
        },
      }
    : {
        idle: {
          background: '#f1f5f9',
          border: '#94a3b8',
          foreground: '#334155',
          chip: 'rgba(0,0,0,0.06)',
        },
        running: {
          background: '#dcfce7',
          border: '#16a34a',
          foreground: '#14532d',
          chip: 'rgba(0,0,0,0.08)',
        },
        blocked: {
          background: '#ffedd5',
          border: '#f59e0b',
          foreground: '#9a3412',
          chip: 'rgba(0,0,0,0.08)',
        },
        fault: {
          background: '#f3e8ff',
          border: '#9333ea',
          foreground: '#6b21a8',
          chip: 'rgba(0,0,0,0.08)',
        },
      };

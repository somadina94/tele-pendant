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

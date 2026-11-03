export type RegisterRef = {
  id: string;
  name: string;
  address: number;
  kind: string;
  trended?: boolean;
  nodeId?: string | null;
};

export type Cell = {
  id: string;
  row: number;
  col: number;
  label: string;
  style: string;
  isMotion: boolean;
  requiresSafeAction: boolean;
  primaryRegister?: RegisterRef | null;
  feedbackRegister?: RegisterRef | null;
  statusRegister?: RegisterRef | null;
};

export type Overlay = {
  id: string;
  label: string;
  xPct: number;
  yPct: number;
  format: string;
  register?: RegisterRef | null;
};

export type Background = {
  id: string;
  name: string;
  cssBackground?: string | null;
  imageUrl?: string | null;
};

export type Layout = {
  matrix: { rows: number; cols: number };
  cells: Cell[];
  background: Background | null;
  overlays: Overlay[];
  registers: RegisterRef[];
  safety: { mode: string; deadmanActive: boolean };
};

export type PlcConnection = {
  id: string;
  label: string;
  host: string;
  port: number;
  unitId?: number;
  enabled: boolean;
  isSimulator: boolean;
  protocol?: 'modbus-tcp' | 'opcua';
};

export type ScreenName =
  'operator' | 'media' | 'face' | 'ops' | 'config' | 'audit' | 'assistant';

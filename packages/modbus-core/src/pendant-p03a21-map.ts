/**
 * Siemens P03A21 welding pendant — demo Modbus map.
 * Drawing tags (I200.x / Q200.x) are remapped onto contiguous 0-based coils.
 * Keep DEMO_CRANE_MAP for crane regression; this is the milestone-1 soft pendant.
 */
export const DEMO_P03A21_MAP = {
  /** Digital inputs from pendant pushbuttons / selector sides. */
  di: {
    teachSeamTrackingLaser: 20, // I200.0 -S01
    seamTrackingOnOff: 21, // I200.1 -S02
    moveWeldingPosition: 22, // I200.2 -S03
    owcvaDown: 23, // I200.3 -S04:24
    owcvaUp: 24, // I200.4 -S04:14
    moveHomePosition: 25, // I200.5 -S05
    owvaUp: 26, // I200.6 -S06:24
    owvaDown: 27, // I200.7 -S06:14
    teachPipeMiddle: 28, // I201.0 -S07
    owhaBack: 29, // I201.1 -S08:24
    owhaFwd: 30, // I201.2 -S08:14
    axisFastSlowly: 31, // I201.3 -S09
    owcaBack: 32, // I201.4 -S10:24
    owcaFwd: 33, // I201.5 -S10:14
    owwacUp: 34, // I201.6 -S11:24
    owwacDown: 35, // I201.7 -S11:14
    owvaHeightReg: 36, // I202.0 -S12
    owwdcUp: 37, // I202.1 -S13:24
    owwdcDown: 38, // I202.2 -S13:14
    teachWeldingPosition: 39, // I202.3 -S14
    owffClose: 40, // I202.4 -S15:24
    owffOpen: 41, // I202.5 -S15:14
    buttonsActive: 42, // local demo DI for Buttons active PB
    enable: 43, // I384.2 / I384.6 collapsed to one demo enable
  },
  /** Indicator lamps (DO) — simulator echoes related DI/action. */
  do: {
    buttonsActive: 50, // Q200.0 -P01
    teachSeamTrackingLaser: 51, // Q200.1 -P02
    seamTrackingOnOff: 52, // Q200.2 -P03
    moveWeldingPosition: 53, // Q200.3 -P04
    owcvaSelector: 54, // Q200.4 -P05
    moveHomePosition: 55, // Q200.5 -P06
    owvaSelector: 56, // Q200.6 -P07
    moveWeldingPositionAlt: 57, // Q200.7 -P08 (move welding lamp)
    owhaSelector: 58, // Q201.0 -P09
    axisFastSlowly: 59, // Q201.1 -P10
    owcaSelector: 60, // Q201.2 -P11
    owwacSelector: 61, // Q201.3 -P12
    owvaHeightReg: 62, // Q201.4 -P13
    owwdcSelector: 63, // Q201.5 -P14
    teachWeldingPosition: 64, // Q201.6 -P15
    owffSelector: 65, // Q201.7 -P16
  },
  /** Shared safety coils (aligned with crane map so safety roles stay valid). */
  safety: {
    deadman: 10,
    eStop: 11,
  },
} as const;

export type PendantP03a21DiKey = keyof typeof DEMO_P03A21_MAP.di;
export type PendantP03a21DoKey = keyof typeof DEMO_P03A21_MAP.do;

/** Register name helpers used by HMI seed / layout DTOs. */
export function pendantDiName(key: PendantP03a21DiKey): string {
  return `coil.p03a21.di.${key}`;
}

export function pendantDoName(key: PendantP03a21DoKey): string {
  return `coil.p03a21.do.${key}`;
}

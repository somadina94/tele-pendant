export type MobileConfigSection =
  | 'plc'
  | 'registers'
  | 'cells'
  | 'labels'
  | 'background'
  | 'codes'
  | 'alarms'
  | 'safety';

export const MOBILE_CONFIG_SECTIONS: Array<{
  value: MobileConfigSection;
  label: string;
}> = [
  { value: 'plc', label: 'PLC connections' },
  { value: 'registers', label: 'Register maps' },
  { value: 'cells', label: 'Matrix cells' },
  { value: 'labels', label: 'Live labels' },
  { value: 'background', label: 'Background' },
  { value: 'codes', label: 'QR / scan codes' },
  { value: 'alarms', label: 'Alarm definitions' },
  { value: 'safety', label: 'Safety roles' },
];

export type ConfigSectionId =
  | 'users'
  | 'plc'
  | 'registers'
  | 'cells'
  | 'labels'
  | 'background'
  | 'codes'
  | 'alarms'
  | 'safety';

const ALL_SECTIONS: ConfigSectionId[] = [
  'users',
  'plc',
  'registers',
  'cells',
  'labels',
  'background',
  'codes',
  'alarms',
  'safety',
];

export type ConfigSectionGroup = {
  title: string;
  items: { id: ConfigSectionId; label: string }[];
};

export function configSectionGroups(
  showUsers: boolean,
  allowedIds?: Set<ConfigSectionId>,
): ConfigSectionGroup[] {
  const groups: ConfigSectionGroup[] = [
    {
      title: 'Plant',
      items: [
        { id: 'plc', label: 'PLC connections' },
        { id: 'registers', label: 'Register maps' },
      ],
    },
    {
      title: 'Operator screen',
      items: [
        { id: 'cells', label: 'Matrix cells' },
        { id: 'labels', label: 'Live labels' },
        { id: 'background', label: 'Background' },
        { id: 'codes', label: 'QR / scan codes' },
      ],
    },
    {
      title: 'Safety & alarms',
      items: [
        { id: 'alarms', label: 'Alarm definitions' },
        { id: 'safety', label: 'Safety roles' },
      ],
    },
  ];
  let merged: ConfigSectionGroup[] = groups;
  if (showUsers) {
    merged = [
      {
        title: 'Administration',
        items: [{ id: 'users', label: 'Users' }],
      },
      ...groups,
    ];
  }
  if (!allowedIds) return merged;
  return merged
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedIds.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
}

export function parseConfigSection(
  raw: string | null,
  showUsers: boolean,
  allowedIds?: Set<ConfigSectionId>,
): ConfigSectionId {
  const fallback = (allowedIds?.has('plc') ? 'plc' : [...(allowedIds ?? [])][0]) ?? 'plc';
  if (raw && ALL_SECTIONS.includes(raw as ConfigSectionId)) {
    if (raw === 'users' && !showUsers) return fallback as ConfigSectionId;
    if (allowedIds && !allowedIds.has(raw as ConfigSectionId)) {
      return fallback as ConfigSectionId;
    }
    return raw as ConfigSectionId;
  }
  return fallback as ConfigSectionId;
}

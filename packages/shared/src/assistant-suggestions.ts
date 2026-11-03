export interface SuggestionGroup {
  id: string;
  title: string;
  questions: string[];
}

/** Suggested operator questions grouped by feature area. */
export const ASSISTANT_SUGGESTION_GROUPS: SuggestionGroup[] = [
  {
    id: 'operator-hmi',
    title: 'Operator HMI & matrix',
    questions: [
      'How does the NxM cell matrix work?',
      'What are the three PLC registers on a cell?',
      'How do I use Hoist Up safely?',
      'What happens when I release a motion button?',
      'How do plant graphic overlay labels get their live values?',
      'What does the safety banner show on Operator?',
    ],
  },
  {
    id: 'safety',
    title: 'Safety (deadman, e-stop, watchdog)',
    questions: [
      'How does deadman hold work?',
      'What is the safe-action PIN used for?',
      'What happens on lost Modbus communications?',
      'How does e-stop supervision work?',
      'What is the communication watchdog?',
      'What is safe-state transition on loss of communications?',
      'Is this software SIL certified?',
    ],
  },
  {
    id: 'ops',
    title: 'Ops: alarms, trends, diagnostics',
    questions: [
      'How do I acknowledge an alarm?',
      'When should I shelve an alarm?',
      'Where do I see real-time trends?',
      'What does the diagnostics dashboard show?',
      'What does PLC connected false mean?',
    ],
  },
  {
    id: 'media',
    title: 'Media: camera, QR, voice',
    questions: [
      'How does integrated camera support work?',
      'How do I resolve a QR or barcode?',
      'What voice commands are supported?',
      'What happens when I press UP on Media?',
      'What if speech recognition is not supported?',
    ],
  },
  {
    id: 'auth-face',
    title: 'Login & face recognition',
    questions: [
      'How does password login work?',
      'How do I enroll face recognition?',
      'Is face login a certified biometric?',
      'What happens if face match fails?',
    ],
  },
  {
    id: 'config',
    title: 'Config: PLC, cells, overlays',
    questions: [
      'How do I add a real PLC connection?',
      'How do I map Modbus registers?',
      'How do I bind a cell to coil.hoistUp?',
      'How do I edit overlay labels on the plant graphic?',
      'How do I set safety roles for deadman and e-stop?',
      'How do I change the background image?',
    ],
  },
  {
    id: 'audit-ota-i18n',
    title: 'Audit, OTA, languages',
    questions: [
      'What does the audit log record?',
      'Who can view the audit log?',
      'How do OTA updates work for the phone app?',
      'How do I switch language (English / Spanish)?',
    ],
  },
  {
    id: 'assistant',
    title: 'This assistant',
    questions: [
      'What can this assistant help with?',
      'What is out of scope for the assistant?',
      'How do I change the docs root or docs link?',
      'When does the assistant use Cursor vs local search?',
    ],
  },
];

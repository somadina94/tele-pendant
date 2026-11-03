/** Screen ids used by web routes and Expo tabs for walkthrough step lists. */
export type TourScreen =
  | 'login'
  | 'operator'
  | 'media'
  | 'ops'
  | 'face'
  | 'audit'
  | 'assistant'
  | 'config';

/** Ordered HelpTip ids for a guided walkthrough on one screen. */
export function tourStepsFor(screen: TourScreen): string[] {
  switch (screen) {
    case 'login':
      return [
        'tour.login.language',
        'tour.login.email',
        'tour.login.password',
        'tour.login.signIn',
        'tour.login.face',
      ];
    case 'operator':
      return [
        'tour.operator.nav',
        'tour.operator.banner',
        'tour.operator.graphic',
        'tour.operator.safePin',
        'tour.operator.matrix',
        'tour.operator.holdHint',
      ];
    case 'media':
      return [
        'tour.media.camera',
        'tour.media.qr',
        'tour.media.voice',
        'tour.media.upDown',
      ];
    case 'ops':
      return [
        'tour.ops.diagnostics',
        'tour.ops.alarms',
        'tour.ops.ack',
        'tour.ops.trends',
      ];
    case 'face':
      return ['tour.face.title', 'tour.face.enroll', 'tour.face.login'];
    case 'audit':
      return ['tour.audit.title', 'tour.audit.list'];
    case 'assistant':
      return ['tour.assistant.title', 'tour.assistant.ask'];
    case 'config':
      return [
        'tour.config.plc',
        'tour.config.registers',
        'tour.config.cells',
        'tour.config.labels',
        'tour.config.background',
        'tour.config.alarms',
        'tour.config.safety',
      ];
    default:
      return [];
  }
}

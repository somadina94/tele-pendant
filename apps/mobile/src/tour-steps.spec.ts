import { tourStepsFor } from '@tele-pendant/shared';

describe('tourStepsFor', () => {
  it('returns ordered step ids for each screen', () => {
    expect(tourStepsFor('login')).toEqual([
      'tour.login.language',
      'tour.login.email',
      'tour.login.password',
      'tour.login.signIn',
      'tour.login.face',
    ]);
    expect(tourStepsFor('operator')[0]).toBe('tour.operator.nav');
    expect(tourStepsFor('config')).toContain('tour.config.safety');
  });
});

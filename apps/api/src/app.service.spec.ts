import { AppService } from './app.service';

describe('AppService', () => {
  it('returns ok health payload', () => {
    const service = new AppService();
    const health = service.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('tele-pendant-api');
    expect(health.timestamp).toBeDefined();
  });
});

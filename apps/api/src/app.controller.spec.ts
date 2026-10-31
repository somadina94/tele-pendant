import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('delegates health to AppService', () => {
    const appService = new AppService();
    const controller = new AppController(appService);
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
  });
});

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'tele-pendant-api',
      timestamp: new Date().toISOString(),
    };
  }
}

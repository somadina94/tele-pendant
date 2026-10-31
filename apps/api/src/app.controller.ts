import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

/**
 * Application health endpoints.
 */
@ApiTags('health')
@Controller()
export class AppController {
  private readonly appService: AppService;

  /**
   * @param appService application service
   */
  constructor(@Inject(AppService) appService: AppService) {
    this.appService = appService;
  }

  /**
   * Liveness probe for load balancers and Docker healthchecks.
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  getHealth() {
    return this.appService.getHealth();
  }
}

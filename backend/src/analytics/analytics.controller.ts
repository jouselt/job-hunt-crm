import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService, PipelineStats } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('pipeline')
  pipeline(@Req() req: any): Promise<PipelineStats> {
    return this.analytics.getPipelineStats(req.user.userId);
  }
}

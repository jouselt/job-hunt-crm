import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { SetJevKeyDto } from './dto/set-jev-key.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Post('jev-key')
  @HttpCode(204)
  async setJevKey(@Body() dto: SetJevKeyDto, @Req() req: any): Promise<void> {
    await this.settings.setJevKey(req.user.userId, dto.key);
  }

  @Get('jev-key')
  async getJevKey(@Req() req: any) {
    return this.settings.getJevKeyMasked(req.user.userId);
  }
}

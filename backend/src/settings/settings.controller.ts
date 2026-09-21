import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { SetJevKeyDto } from './dto/set-jev-key.dto';
import { SetProfileDto } from './dto/set-profile.dto';
import { probeJevKey } from './jev-key-probe';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /**
   * Verify the key against TypeSafe before storing it. A key that the vendor
   * rejects is refused outright: storing it would produce a "Key saved."
   * confirmation and then fail silently at triage time, which is how a bad
   * paste turns into a bug hunt. A key we simply could not check (network,
   * 429, 5xx) is still stored, because we must not block a valid key on the
   * vendor being unavailable.
   */
  @Post('jev-key')
  @HttpCode(204)
  async setJevKey(@Body() dto: SetJevKeyDto, @Req() req: any): Promise<void> {
    const probe = await probeJevKey(dto.key);
    if (probe.rejected) {
      throw new BadRequestException(probe.message);
    }
    await this.settings.setJevKey(req.user.userId, dto.key);
  }

  @Get('jev-key')
  async getJevKey(@Req() req: any) {
    return this.settings.getJevKeyMasked(req.user.userId);
  }

  @Post('profile')
  @HttpCode(200)
  async setProfile(@Body() dto: SetProfileDto, @Req() req: any): Promise<void> {
    await this.settings.setTriageProfile(req.user.userId, dto.profile);
  }

  @Get('profile')
  async getProfile(@Req() req: any) {
    const profile = await this.settings.getTriageProfile(req.user.userId);
    return { configured: !!profile, profile };
  }
}

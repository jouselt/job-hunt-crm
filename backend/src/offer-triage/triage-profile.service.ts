import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_TRIAGE_PROFILE } from './profile.default';

@Injectable()
export class TriageProfileService {
  constructor(private readonly settings: SettingsService) {}

  getDefault(): any {
    return DEFAULT_TRIAGE_PROFILE;
  }

  async getForUser(userId: string): Promise<any> {
    return (await this.settings.getTriageProfile(userId)) ?? DEFAULT_TRIAGE_PROFILE;
  }
}

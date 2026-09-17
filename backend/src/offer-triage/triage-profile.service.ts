import { Injectable } from '@nestjs/common';
import { DEFAULT_TRIAGE_PROFILE } from './profile.default';

@Injectable()
export class TriageProfileService {
  private readonly defaultProfile = DEFAULT_TRIAGE_PROFILE;

  getDefault(): any {
    return this.defaultProfile;
  }

  // Per-user profile overrides can be added later (e.g. from UserSettings).
  getForUser(_userId: string): any {
    return this.defaultProfile;
  }
}

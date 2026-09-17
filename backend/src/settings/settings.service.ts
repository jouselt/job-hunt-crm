import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';
import { UserSettings } from './user-settings.entity';

@Injectable()
export class SettingsService {
  private readonly encKey: Buffer;

  constructor(
    @InjectRepository(UserSettings)
    private readonly repo: Repository<UserSettings>,
    private readonly config: ConfigService,
  ) {
    const secret = this.config.get<string>('JWT_SECRET') ?? '';
    this.encKey = createHash('sha256').update(secret).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  private decrypt(stored: string): string {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encKey,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  }

  private mask(plain: string): string {
    if (plain.length <= 4) return `****${plain}`;
    return `****${plain.slice(-4)}`;
  }

  async setJevKey(userId: string, plain: string): Promise<void> {
    await this.repo.save({ userId, jevApiKeyEnc: this.encrypt(plain) });
  }

  async getJevKeyMasked(
    userId: string,
  ): Promise<{ configured: boolean; masked: string | null }> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row || !row.jevApiKeyEnc) {
      return { configured: false, masked: null };
    }
    return { configured: true, masked: this.mask(this.decrypt(row.jevApiKeyEnc)) };
  }

  async getJevKeyPlain(userId: string): Promise<string> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row || !row.jevApiKeyEnc) {
      throw new NotFoundException('JEV_API_KEY not configured');
    }
    return this.decrypt(row.jevApiKeyEnc);
  }
}

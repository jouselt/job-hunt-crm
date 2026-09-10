import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { Application } from '../applications/application.entity';
import { FollowUpsService } from './follow-ups.service';

/**
 * Daily 9:00 AM reminder job.
 *
 * Finds all applications due for follow-up today (or overdue) and produces a
 * single summary per user, e.g. "You have X applications due for follow-up
 * today". Users with zero due applications receive nothing.
 *
 * The Application record has no email field (email belongs to the auth/user
 * domain, which has no user table in the MVP). The summary is therefore:
 *   - sent via SendGrid to SENDGRID_TO_EMAIL when that fallback + API key are
 *     configured (single-owner MVP), or
 *   - logged per user otherwise.
 * A real multi-user deployment must map user_id -> email via a users table
 * (documented as a follow-up, not silently faked here).
 */
@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);
  private readonly sendgridKey?: string;
  private readonly fromEmail?: string;
  private readonly fallbackToEmail?: string;

  constructor(
    private readonly followUps: FollowUpsService,
    private readonly config: ConfigService,
  ) {
    this.sendgridKey = this.config.get<string>('SENDGRID_API_KEY');
    this.fromEmail = this.config.get<string>('SENDGRID_FROM_EMAIL');
    this.fallbackToEmail = this.config.get<string>('SENDGRID_TO_EMAIL');
    if (this.sendgridKey) {
      sgMail.setApiKey(this.sendgridKey);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleDailyReminders(): Promise<void> {
    const due = await this.followUps.findDueForAll();
    const byUser = this.groupByUser(due);
    for (const [userId, apps] of byUser) {
      if (apps.length === 0) {
        continue;
      }
      await this.sendSummary(userId, apps);
    }
  }

  groupByUser(apps: Application[]): Map<string, Application[]> {
    const map = new Map<string, Application[]>();
    for (const app of apps) {
      const bucket = map.get(app.user_id) ?? [];
      bucket.push(app);
      map.set(app.user_id, bucket);
    }
    return map;
  }

  async sendSummary(userId: string, apps: Application[]): Promise<void> {
    const count = apps.length;
    const subject = `You have ${count} application${count === 1 ? '' : 's'} due for follow-up today`;
    const lines = apps.map(
      (a) => `- ${a.company} (${a.role}): stage ${a.stage}, follow-up by ${a.follow_up_date}`,
    );
    const body = `You have ${count} application${count === 1 ? '' : 's'} due for follow-up today.\n\n${lines.join('\n')}\n\nMove them forward or snooze for tomorrow.`;

    if (!this.sendgridKey || !this.fromEmail || !this.fallbackToEmail) {
      this.logger.log(
        `[reminder] user=${userId} count=${count} (no email transport configured; not sent)\n${body}`,
      );
      return;
    }

    const msg: sgMail.MailDataRequired = {
      to: this.fallbackToEmail,
      from: this.fromEmail,
      subject,
      text: body,
    };
    await sgMail.send(msg);
    this.logger.log(`[reminder] sent summary for user=${userId} (${count} due)`);
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { Application } from '../applications/application.entity';
import { FollowUpsService } from './follow-ups.service';
import { UsersService } from '../users/users.service';

/**
 * Daily 9:00 AM reminder job.
 *
 * Finds all applications due for follow-up today (or overdue) and produces a
 * single summary per user, e.g. "You have X applications due for follow-up
 * today". Users with zero due applications receive nothing.
 *
 * Each user's registered email (from the users table) is resolved per-user and
 * used as the SendGrid recipient. The SENDGRID_TO_EMAIL env acts only as a
 * fallback override for single-owner deployments when no user record maps to a
 * due application (legacy), and is never required once users exist.
 */
@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);
  private readonly sendgridKey?: string;
  private readonly fromEmail?: string;
  private readonly fallbackToEmail?: string;

  constructor(
    private readonly followUps: FollowUpsService,
    private readonly users: UsersService,
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

  private async resolveRecipient(userId: string): Promise<string | undefined> {
    const user = await this.users.findById(userId);
    if (user) {
      return user.email;
    }
    return this.fallbackToEmail;
  }

  async sendSummary(userId: string, apps: Application[]): Promise<void> {
    const count = apps.length;
    const subject = `You have ${count} application${count === 1 ? '' : 's'} due for follow-up today`;
    const lines = apps.map(
      (a) => `- ${a.company} (${a.role}): stage ${a.stage}, follow-up by ${a.follow_up_date}`,
    );
    const body = `You have ${count} application${count === 1 ? '' : 's'} due for follow-up today.\n\n${lines.join('\n')}\n\nMove them forward or snooze for tomorrow.`;

    const to = await this.resolveRecipient(userId);

    if (!this.sendgridKey || !this.fromEmail || !to) {
      this.logger.log(
        `[reminder] user=${userId} count=${count} (no email transport or recipient; not sent)\n${body}`,
      );
      return;
    }

    const msg: sgMail.MailDataRequired = {
      to,
      from: this.fromEmail,
      subject,
      text: body,
    };
    await sgMail.send(msg);
    this.logger.log(`[reminder] sent summary for user=${userId} (${count} due)`);
  }
}
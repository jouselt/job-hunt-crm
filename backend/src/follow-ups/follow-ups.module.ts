import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Application } from '../applications/application.entity';
import { FollowUpsService } from './follow-ups.service';
import { FollowUpsController } from './follow-ups.controller';
import { RemindersCron } from './reminders.cron';

@Module({
  imports: [TypeOrmModule.forFeature([Application])],
  providers: [FollowUpsService, RemindersCron],
  controllers: [FollowUpsController],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}

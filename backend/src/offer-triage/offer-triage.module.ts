import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Offer } from './offer.entity';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { OfferTriageService } from './offer-triage.service';
import { JevClient } from './jev-client';
import { TriageProfileService } from './triage-profile.service';
import { ApplicationsModule } from '../applications/applications.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Offer]), ApplicationsModule, SettingsModule],
  controllers: [OffersController],
  providers: [OffersService, OfferTriageService, JevClient, TriageProfileService],
  exports: [OfferTriageService, OffersService, TriageProfileService],
})
export class OfferTriageModule {}

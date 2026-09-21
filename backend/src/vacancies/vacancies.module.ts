import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Offer } from '../offer-triage/offer.entity';
import { OfferTriageModule } from '../offer-triage/offer-triage.module';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';
import { Vacancy } from './vacancy.entity';

@Module({
  // `Offer` entra porque el tablero puntua las dos fuentes con la misma regla y
  // las sirve en una sola lista. `OfferTriageModule` entra por `TriageProfileService`:
  // el perfil tiene que ser el mismo que recibe Jev, o el puntaje local y el de Jev
  // describirian dos candidatos distintos.
  imports: [TypeOrmModule.forFeature([Vacancy, Offer]), OfferTriageModule],
  controllers: [VacanciesController],
  providers: [VacanciesService],
  exports: [VacanciesService],
})
export class VacanciesModule {}

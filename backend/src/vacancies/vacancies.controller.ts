import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RefreshVacanciesDto } from './dto/refresh-vacancies.dto';
import { VacanciesService } from './vacancies.service';

@Controller('vacancies')
@UseGuards(JwtAuthGuard)
export class VacanciesController {
  constructor(private readonly vacancies: VacanciesService) {}

  /** Todo lo postulable, con el puntaje local y el motivo de cada rechazo. */
  @Get('scoreboard')
  scoreboard(@Req() req: any) {
    return this.vacancies.scoreboard(req.user.userId);
  }

  /** El progreso del refresco en curso, o el resultado del ultimo. */
  @Get('refresh')
  refreshStatus(@Req() req: any) {
    return this.vacancies.getJob(req.user.userId);
  }

  /**
   * Dispara la ingesta. Responde enseguida: son unas 33 paginas con pausa entre
   * cada una, asi que corre en segundo plano y el progreso se mira en el GET.
   */
  @Post('refresh')
  startRefresh(@Req() req: any, @Body() dto: RefreshVacanciesDto) {
    return this.vacancies.startRefresh(req.user.userId, dto ?? {});
  }

  /** Recalcula los puntajes guardados con el perfil actual, sin tocar la red. */
  @Post('rescore')
  rescore(@Req() req: any) {
    return this.vacancies.rescore(req.user.userId);
  }
}

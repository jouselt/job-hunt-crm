import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Raw } from 'typeorm';
import { Application } from './application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { computeFollowUp, promoteStage } from './stage.transitions';
import { STAGES } from './stage.constants';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly repo: Repository<Application>,
  ) {}

  create(dto: CreateApplicationDto, userId: string): Promise<Application> {
    const stage = dto.stage ?? STAGES.APPLIED;
    const app = this.repo.create({
      ...dto,
      user_id: userId,
      stage,
      // Una fila guardada no tiene fecha de postulacion: todavia no postulaste. Se
      // sella cuando la fila llega a `applied`, no cuando la guardas. Antes el
      // esquema lo forzaba (NOT NULL) y Track escribia la fecha de hoy, o sea
      // registraba una postulacion que no existio.
      applied_date:
        stage === STAGES.SAVED
          ? (dto.applied_date ?? null)
          : (dto.applied_date ?? new Date().toISOString().slice(0, 10)),
    });
    return this.repo.save(app);
  }

  findOwned(userId: string): Promise<Application[]> {
    return this.repo.find({
      where: { user_id: userId },
      // `nulls: 'FIRST'` explicito a proposito: las filas guardadas tienen la fecha
      // nula y son las que esperan accion, asi que van arriba. Sin esto dependeria
      // del default de Postgres para DESC, que es un detalle del motor y no una
      // decision nuestra.
      order: { applied_date: { direction: 'DESC', nulls: 'FIRST' } },
    });
  }

  /** La postulacion que salio de una vacante, si ya se trackeo. */
  findByVacancy(userId: string, vacancyId: string): Promise<Application | null> {
    return this.repo.findOne({ where: { user_id: userId, vacancyId } });
  }

  /**
   * Los ids de vacante ya trackeados.
   *
   * El tablero marca cada fila con esto; una consulta por vacante seria una
   * consulta por fila sobre una lista de mas de mil.
   */
  async trackedVacancyIds(userId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { user_id: userId },
      select: ['vacancyId'],
    });
    return rows
      .map((row) => row.vacancyId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  async findOwnedById(userId: string, id: string): Promise<Application> {
    const app = await this.repo.findOne({ where: { id, user_id: userId } });
    if (!app) throw new NotFoundException();
    return app;
  }

  async promoteStage(
    userId: string,
    id: string,
    dto: UpdateStageDto,
  ): Promise<Application> {
    const app = await this.findOwnedById(userId, id);
    const next = promoteStage(app.stage, dto.stage);
    app.stage = next;
    // La fecha se sella al LLEGAR a `applied`: es el dia en que postulaste de verdad,
    // no el dia en que guardaste la fila.
    if (next === STAGES.APPLIED && !app.applied_date) {
      app.applied_date = new Date().toISOString().slice(0, 10);
    }
    app.follow_up_date = computeFollowUp(next, app.follow_up_date);
    return this.repo.save(app);
  }

  findDue(userId: string): Promise<Application[]> {
    return this.repo.find({
      where: {
        user_id: userId,
        follow_up_date: Raw((alias) => `${alias} <= CURRENT_DATE`),
      },
      order: { follow_up_date: 'ASC' },
    });
  }
}

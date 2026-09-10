import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Raw } from 'typeorm';
import { Application } from './application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { computeFollowUp, promoteStage } from './stage.transitions';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly repo: Repository<Application>,
  ) {}

  create(dto: CreateApplicationDto, userId: string): Promise<Application> {
    const app = this.repo.create({
      ...dto,
      user_id: userId,
      stage: dto.stage ?? 'applied',
      applied_date:
        dto.applied_date ?? new Date().toISOString().slice(0, 10),
    });
    return this.repo.save(app);
  }

  findOwned(userId: string): Promise<Application[]> {
    return this.repo.find({
      where: { user_id: userId },
      order: { applied_date: 'DESC' },
    });
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

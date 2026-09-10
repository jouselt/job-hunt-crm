import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Raw } from 'typeorm';
import { Application } from '../applications/application.entity';

@Injectable()
export class FollowUpsService {
  constructor(
    @InjectRepository(Application)
    private readonly repo: Repository<Application>,
  ) {}

  findDue(userId: string): Promise<Application[]> {
    return this.repo.find({
      where: {
        user_id: userId,
        follow_up_date: Raw((alias) => `${alias} <= CURRENT_DATE`),
      },
      order: { follow_up_date: 'ASC' },
    });
  }

  async findDueForAll(): Promise<Application[]> {
    const all = await this.repo.find({
      where: {
        follow_up_date: Raw((alias) => `${alias} <= CURRENT_DATE`),
      },
    });
    return all;
  }
}

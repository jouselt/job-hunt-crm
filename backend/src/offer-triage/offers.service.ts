import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Offer } from './offer.entity';
import { CreateOfferDto } from './dto/create-offer.dto';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer)
    private readonly repo: Repository<Offer>,
  ) {}

  async ingest(userId: string, dto: CreateOfferDto): Promise<Offer> {
    const existing = await this.repo.findOne({
      where: { userId, externalId: dto.id },
    });
    if (existing) {
      existing.title = dto.title;
      existing.company = dto.company;
      existing.companyUrl = dto.companyUrl ?? null;
      existing.location = dto.location ?? null;
      existing.url = dto.url ?? null;
      existing.description = dto.description ?? null;
      existing.deadline = dto.deadline ?? null;
      existing.applyUrl = dto.applyUrl ?? null;
      return this.repo.save(existing);
    }
    const offer = this.repo.create({
      userId,
      externalId: dto.id,
      title: dto.title,
      company: dto.company,
      companyUrl: dto.companyUrl ?? null,
      location: dto.location ?? null,
      url: dto.url ?? null,
      description: dto.description ?? null,
      deadline: dto.deadline ?? null,
      applyUrl: dto.applyUrl ?? null,
      status: 'NEW',
    });
    return this.repo.save(offer);
  }

  async findOwned(userId: string): Promise<Offer[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findReview(userId: string): Promise<Offer[]> {
    return this.repo.find({
      where: { userId, status: 'REVIEW' },
      order: { createdAt: 'DESC' },
    });
  }
}

import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OffersService } from './offers.service';
import { OfferTriageService } from './offer-triage.service';
import { CreateOfferDto } from './dto/create-offer.dto';

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly triage: OfferTriageService,
  ) {}

  @Post('import')
  ingest(@Body() dto: CreateOfferDto, @Req() req: any) {
    return this.offers.ingest(req.user.userId, dto);
  }

  @Get()
  findOwned(@Req() req: any) {
    return this.offers.findOwned(req.user.userId);
  }

  @Get('review')
  findReview(@Req() req: any) {
    return this.offers.findReview(req.user.userId);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Req() req: any) {
    return this.triage.humanSend(id, req.user.userId);
  }

  @Post(':id/skip')
  skip(@Param('id') id: string, @Req() req: any) {
    return this.triage.humanSkip(id, req.user.userId);
  }
}

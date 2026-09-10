import { Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateStageDto } from './dto/update-stage.dto';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.applicationsService.findOwned(req.user.userId);
  }

  @Post()
  create(@Body() createApplicationDto: CreateApplicationDto, @Req() req: any) {
    return this.applicationsService.create(createApplicationDto, req.user.userId);
  }

  @Patch(':id/stage')
  promoteStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStageDto: UpdateStageDto,
    @Req() req: any,
  ) {
    return this.applicationsService.promoteStage(req.user.userId, id, updateStageDto);
  }
}

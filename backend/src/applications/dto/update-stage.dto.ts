import { IsEnum } from 'class-validator';
import { ALL_STAGES } from '../stage.constants';

export class UpdateStageDto {
  @IsEnum(ALL_STAGES)
  stage = '';
}

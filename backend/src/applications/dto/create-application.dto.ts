import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ALL_SOURCES, ALL_STAGES } from '../stage.constants';

export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  company = '';

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  role = '';

  @IsOptional()
  @IsEnum(ALL_SOURCES)
  source?: string;

  @IsOptional()
  @IsEnum(ALL_STAGES)
  stage?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  applied_date?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  follow_up_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * La vacante de la que sale esta postulacion, cuando se trackea desde el tablero.
   * Opcional: una postulacion cargada a mano no la tiene.
   */
  @IsOptional()
  @IsUUID()
  vacancyId?: string;
}

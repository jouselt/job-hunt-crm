import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  id!: string;

  @IsString()
  title!: string;

  @IsString()
  company!: string;

  @IsOptional()
  @IsString()
  companyUrl?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  applyUrl?: string;
}

import { IsString, MinLength } from 'class-validator';

export class SetJevKeyDto {
  @IsString()
  @MinLength(1)
  key!: string;
}

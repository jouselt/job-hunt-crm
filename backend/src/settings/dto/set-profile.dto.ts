import { IsObject, IsNotEmpty } from 'class-validator';

export class SetProfileDto {
  @IsObject()
  @IsNotEmpty()
  profile!: Record<string, any>;
}

import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_settings')
export class UserSettings {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'text', nullable: true })
  jevApiKeyEnc?: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}

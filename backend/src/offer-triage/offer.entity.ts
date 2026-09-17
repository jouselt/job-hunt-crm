import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('offers')
@Index('idx_offers_user_external', ['userId', 'externalId'])
@Index('idx_offers_user_status', ['userId', 'status'])
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  externalId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  company!: string;

  @Column({ type: 'text', nullable: true })
  companyUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  location?: string | null;

  @Column({ type: 'text', nullable: true })
  url?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'date', nullable: true })
  deadline?: string | null;

  @Column({ type: 'text', nullable: true })
  applyUrl?: string | null;

  @Column({ type: 'text', default: 'NEW' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  fit?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  jevRaw?: any;

  @Column({ type: 'float', nullable: true })
  jevConfidence?: number | null;

  @Column({ type: 'date', nullable: true })
  decisionAt?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}

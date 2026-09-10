import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ALL_SOURCES, ALL_STAGES } from './stage.constants';

const sourceCheck =
  `source IN (${ALL_SOURCES.map((s) => `'${s}'`).join(', ')})`;
const stageCheck =
  `stage IN (${ALL_STAGES.map((s) => `'${s}'`).join(', ')})`;

@Entity('applications')
@Index('idx_applications_user_stage', ['user_id', 'stage'])
@Index('idx_applications_user_follow_up', ['user_id', 'follow_up_date'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'text' })
  company!: string;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'text' })
  source!: string;

  @Column({ type: 'text', default: 'applied' })
  stage!: string;

  @Column({ type: 'date' })
  applied_date!: string;

  @Column({ type: 'date', nullable: true })
  follow_up_date!: string | null;

  @Column({ type: 'text', default: '' })
  notes!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

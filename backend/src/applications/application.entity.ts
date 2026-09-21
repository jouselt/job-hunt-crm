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
@Index('idx_applications_user_vacancy', ['user_id', 'vacancyId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  /**
   * La vacante de la que salio, cuando se postulo desde el tablero.
   *
   * Nullable a proposito: una postulacion cargada a mano no tiene vacante detras.
   * El indice unico parcial sobre (user_id, vacancyId) es lo que impide trackear
   * la misma vacante dos veces.
   */
  @Column({ type: 'uuid', nullable: true })
  vacancyId?: string | null;

  @Column({ type: 'text' })
  company!: string;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'text' })
  source!: string;

  @Column({ type: 'text', default: 'applied' })
  stage!: string;

  /**
   * El dia en que postulaste. Nula mientras la fila esta guardada: guardar un aviso
   * no es postular, y sellarle una fecha ahi seria inventar el dato.
   */
  @Column({ type: 'date', nullable: true })
  applied_date?: string | null;

  @Column({ type: 'date', nullable: true })
  follow_up_date!: string | null;

  @Column({ type: 'text', default: '' })
  notes!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

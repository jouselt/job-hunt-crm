import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Una vacante traida de un feed externo, con su puntaje local.
 *
 * Vive en su propia tabla y no en `offers` a proposito. `offers` es la bandeja de
 * triage: lo que entra ahi lo procesa el cron, lo mira la cola de revision y puede
 * terminar en el kanban como postulacion. Meter 1615 avisos de un feed en esa
 * bandeja ensuciaria esa cola y volveria el tablero inutil. Una vacante ingerida
 * no es una oferta hasta que alguien decide que lo es.
 *
 * La clave unica (userId, source, externalId) es lo que hace que refrescar sea
 * idempotente: la misma pega del mismo portal actualiza su fila en vez de
 * duplicarse, y el feed se puede reingerir todos los dias sin limpiar nada.
 */
@Entity('vacancies')
@Index('idx_vacancies_user_source_external', ['userId', 'source', 'externalId'], {
  unique: true,
})
@Index('idx_vacancies_user_score', ['userId', 'score'])
export class Vacancy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  /** Feed del que vino, por ejemplo `pegas-devschile`. */
  @Column({ type: 'text' })
  source!: string;

  /** Portal original dentro del feed, por ejemplo `getonbrd` o `linkedin`. */
  @Column({ type: 'text', nullable: true })
  portal?: string | null;

  @Column({ type: 'text' })
  externalId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  company?: string | null;

  @Column({ type: 'text', nullable: true })
  location?: string | null;

  @Column({ type: 'text', nullable: true })
  category?: string | null;

  @Column({ type: 'text', nullable: true })
  salary?: string | null;

  @Column({ type: 'text', nullable: true })
  url?: string | null;

  @Column({ type: 'date', nullable: true })
  postedAt?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /**
   * De donde salio el texto que se puntuo: `index` cuando solo hay el titulo,
   * `description` cuando hay cuerpo real.
   *
   * Existe porque el indice del feed no trae descripcion. Un puntaje calculado
   * sobre el titulo no es el mismo puntaje que uno calculado sobre el aviso, y
   * mostrar los dos como si fueran lo mismo seria mentir con un numero.
   */
  @Column({ type: 'text', default: 'index' })
  scoredFrom!: string;

  @Column({ type: 'float', default: 0 })
  score!: number;

  /** El detalle del puntaje: skills, senales y descalificadores. */
  @Column({ type: 'jsonb', nullable: true })
  breakdown?: any;

  @Column({ type: 'boolean', default: false })
  admitted!: boolean;

  /** El primer descalificador, cuando la vacante no pasa la compuerta. */
  @Column({ type: 'text', nullable: true })
  rejectReason?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  scoredAt?: Date | null;

  /**
   * Cuando el usuario marco que el aviso ya no esta.
   *
   * El feed no publica si un aviso sigue abierto, asi que la unica fuente
   * confiable es el usuario. Null significa que sigue en juego.
   */
  @Column({ type: 'timestamptz', nullable: true })
  dismissedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Application } from './applications/application.entity';

const result = dotenv.config({ path: path.resolve(__dirname, '../.env') });
if (result.error) {
  // Ignore — .env is optional
}

declare const process: {
  env: {
    DATABASE_URL?: string;
    DB_HOST?: string;
    DB_PORT?: string;
    DB_USER?: string;
    DB_PASS?: string;
    DB_NAME?: string;
  };
};

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [Application],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  synchronize: false,
});

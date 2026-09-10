# Job Hunt CRM

Aplicación web para candidatos que busca organizar su búsqueda de empleo como una pipeline profesional: registrar aplicaciones, seguir stage, programar follow-ups y ver analytics del pipeline.

---

## Stack

| Capas     | Tecnología                                                                 |
|-----------|----------------------------------------------------------------------------|
| Frontend  | Angular 15 (standalone components)                                         |
| Backend   | NestJS 10 + TypeORM + PostgreSQL                                           |
| Auth      | JWT (`@nestjs/jwt` + `passport-jwt`)                                      |
| Cron      | `@nestjs/schedule` (daily 9am)                                            |
| Email     | SendGrid (integración pendiente — ver `reminders.cron.ts`)                |
| DB        | PostgreSQL con RLS (Row-Level Security) por usuario                       |

---

## Qué hace

- **Aplicaciones CRUD:** crear, listar y actualizar aplicaciones de empleo.
- **Stage pipeline:** `applied → screened → interview → offer`. `rejected` es terminal, no columna del Kanban.
- **Follow-up scheduling:** al promover stage, si no hay follow_up_date explícito en el futuro, se setea +7 días. Si está rechazado → `null`.
- **Analytics:** `/analytics/pipeline` devuelve conteos por stage, porcentajes sobre total activo (excluye rejected), y `avgDaysInStage` (avg desde applied_date).
- **Follow-ups due:** `/follow-ups` lista aplicaciones con `follow_up_date <= hoy` (null nunca due).
- **Daily reminder:** cron `@Cron(EVERY_DAY_AT_9AM)` corre diariamente; aún no envía email (pendiente integración SendGrid).

---

## Estructura del proyecto

```
07-job-hunt-crm/
├── backend/
│   ├── src/
│   │   ├── applications/   # Entity, DTOs, service, controller, module, stage.transitions
│   │   ├── auth/           # JWT strategy, guard, auth service + controller (login)
│   │   ├── analytics/      # PipelineStats service + controller
│   │   ├── follow-ups/     # Due service + controller + reminders cron
│   │   ├── health/         # /health
│   │   ├── migrations/     # 0001-init (table + índices + RLS)
│   │   ├── seed/           # seed.ts — 3 apps de prueba
│   │   ├── data-source.ts  # TypeORM DataSource para migrations
│   │   └── app.module.ts
│   └── package.json
├── frontend/
│   ├── src/app/
│   │   ├── components/     # AppliedList, AddApplication, KanbanBoard, PipelineOverview, StageBadge
│   │   ├── services/       # JobHuntService (applications$, pipelineStats$)
│   │   ├── models/         # Application, StageBucket, PipelineStats types
│   │   ├── environments/   # environment.ts (apiUrl)
│   │   └── app.module.ts + app-routing.module.ts
│   └── package.json
├── spec.md                 # Specification (WHAT)
├── design.md               # Design decisions (HOW)
├── tasks.md                # Implementation tasks + plan de PRs encadenados
├── proposal.md             # Proposal original
└── README.md               # Este archivo
```

---

## Endpoint API

Base: `http://localhost:3000/api` (backend).

| Método   | Path                         | Descripción                                                                 | Auth    |
|----------|------------------------------|-----------------------------------------------------------------------------|---------|
| GET      | /health                      | Health check                                                                | —       |
| POST     | /auth/login                  | Login → devuelve `access_token` (body: `{ userId, email }`)               | —       |
| GET      | /applications                | Lista aplicaciones del usuario autenticado                                  | JWT     |
| POST     | /applications                | Crea aplicación (company + role requeridos; source y stage opcionales)      | JWT     |
| PATCH    | /applications/:id/stage      | Promueve stage (solo forward/reject, validado en service)                   | JWT     |
| GET      | /analytics/pipeline          | Returns `{ applied, screened, interview, offer, rejected, avgDaysInStage }`| JWT     |
| GET      | /follow-ups                  | Lista aplicaciones due (follow_up_date <= hoy)                              | JWT     |

### Headers

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Ejemplo login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"550e8400-e29b-41d4-a716-446655440000","email":"dev@example.com"}'
```

---

## Configuración local

### Backend

```bash
cd backend
cp .env.example .env
# Editar .env con valores reales:
#   DATABASE_URL=postgres://USER:PASS@HOST:5432/job_hunt_crm
#   JWT_SECRET=una-frase-segura-larga
# Opcional: SENDGRID_API_KEY, SENDGRID_FROM_EMAIL
npm install
npm run build
```

**Base de datos:** PostgreSQL. Si no tienes una lista, puedes usar Docker:

```bash
docker run --rm --name pg-jobhunt \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=job_hunt_crm \
  -p 5432:5432 \
  -d postgres:15
```

**Migrations:**

```bash
# Requiere DATABASE_URL válida en .env
npm run migration:run
```

**Levantar backend:**

```bash
npm run start:dev
# → http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
# El environment.ts ya apunta a http://localhost:3000/api
npm run start
# → http://localhost:4200
```

---

## Flujo de desarrollo local completo

1. Levantar PostgreSQL (Docker o local).
2. Backend: `cd backend && cp .env.example .env && npm install && npm run migration:run && npm run start:dev`
3. Frontend: `cd frontend && npm install && npm run start`
4. Abrir `http://localhost:4200`

### Seed de prueba

```bash
cd backend
npm run seed
```

Inserta 3 aplicaciones para el user `00000000-0000-0000-0000-000000000001` en stages distintos (applied, screened, interview).

---

## Env vars

| Variable              | Uso                                           | Requerido |
|-----------------------|-----------------------------------------------|-----------|
| DATABASE_URL          | Connection string PostgreSQL                  | Sí        |
| DB_HOST / DB_PORT ... | Alternativa a DATABASE_URL (también funciona) | No        |
| JWT_SECRET            | Secret para firmar tokens                     | Sí        |
| SENDGRID_API_KEY      | Para envío de emails (pendiente)              | No        |
| SENDGRID_FROM_EMAIL   | From address para emails                      | No        |

El `.env` NO se commitea (ver `.gitignore` del backend).

---

## Recruiter signal (demo)

El flujo pensado es:

1. Recruiter: "¿Dónde estás parado en tu búsqueda?"
2. Candidato abre CRM → ve pipeline organizado (etapa actual + próximo follow-up).
3. Muestra dominio del proceso, profesionalismo, signal de que nadie más está gestionando tu búsqueda.

Esto es el "recruiter signal" que el proyecto busca generar.

---

## Estado actual del desarrollo

- **Backend:** Completo (Tasks 1-5). Compila, tiene migrations, seed, endpoint analytics, follow-ups, cron placeholder.
- **Frontend:** Completo (Tasks 6-11). Compila, tiene 5 componentes standalone + servicio + routing.
- **Pendiente:** seed probado contra DB real, deploy config (Docker + Caddy, ver abajo), demo checklist.

Ver `tasks.md` para el plan de PRs encadenados (backend → frontend → seed/deploy).

---

## Decisiones de diseño

Ver `design.md` para detalles. Resumen:

- **ORM único:** TypeORM (no Prisma, no Mongoose).
- **Isolación por usuario:** Query-level `where: { user_id }` en service + RLS policy en PostgreSQL (defense-in-depth).
- **Stage enum:** `applied | screened | interview | offer | rejected` (rejected no es columna del Kanban).
- **Promoción forward-only:** no se puede saltar stage ni retroceder (a menos que sea rejected).
- **Follow-up:** +7 días si no hay uno explícito en el futuro; rejected → null.
- **Analytics:** porcentajes sobre total activo (rejected excluido del 100%).

---

## Tareas pendientes

Ver `tasks.md` tasks 12-15:

- Task 12: seed probado contra DB real
- Task 13: README (esta tarea)
- Task 14: deploy config — Docker Compose + NixOS Caddy (subpath `/job-hunt-crm/`)
- Task 15: demo checklist end-to-end (`DEMO_CHECKLIST.md`)

---

## Deploy (NixOS + Caddy, subpath-first)

Self-hosted, never Vercel/Render. Three containers behind your host Caddy:

```bash
# 1. Configure secrets
cp .env.example .env          # fill DB + JWT_SECRET
cp backend/.env.example backend/.env

# 2. Build + run the stack (no published ports; Caddy proxies)
docker compose up -d --build

# 3. Run migrations + seed inside the backend container
docker compose exec backend npm run migration:run
docker compose exec backend npm run seed
```

Caddy routes (see `Caddyfile.example`, wire into your NixOS Caddy):

```
handle_path /job-hunt-crm/*     { reverse_proxy frontend:80 }
handle_path /job-hunt-crm/api/* { reverse_proxy backend:3000 }
```

- Frontend SPA is served by nginx from `/usr/share/nginx/html/job-hunt-crm` with
  `base-href /job-hunt-crm/` and prod API URL `/job-hunt-crm/api`.
- Backend has no published port; only Caddy reaches it on the compose network.
- For declarative NixOS wiring, see `nixos-module.example.nix`.

---

## Commits

El proyecto sigue convención de commits. Ver `git log` para historial. Los PRs se planean encadenados (backend primero, luego frontend, luego seed/deploy).

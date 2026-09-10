# Job Hunt CRM — Frontend (Angular 15) static build, served by nginx
# Build outputs to /usr/share/nginx/html/job-hunt-crm so it sits under the
# subpath /job-hunt-crm/ (matches Caddy route + Angular base-href).
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Production build with subpath base-href + prod API URL (see environment.prod.ts)
RUN npx ng build --configuration production --base-href /job-hunt-crm/

FROM nginx:1.27-alpine AS runtime
# SPA fallback: any unknown path under the app returns index.html so the
# Angular router can handle deep links.
COPY --from=build /app/dist/job-hunt-crm /usr/share/nginx/html/job-hunt-crm
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

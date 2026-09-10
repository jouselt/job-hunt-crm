# Job Hunt CRM — Backend (NestJS 10) image
# Multi-stage: install + build, then run from dist on a thin runtime.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
# typeorm-ts-node-commonjs is a devDependency; copy it too so `npm run seed` works in-container if needed.
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
EXPOSE 3000
CMD ["node", "dist/main"]

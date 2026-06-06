FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY scripts scripts
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS builder
WORKDIR /app
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run db:generate --workspace @ai-kingdom/api
RUN npm run build --workspace @ai-kingdom/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
RUN chmod +x apps/api/docker-entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]

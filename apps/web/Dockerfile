FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --filter @cirofy/web... --frozen-lockfile=false
RUN pnpm --filter @cirofy/shared build
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
EXPOSE 3001
CMD ["pnpm", "start"]

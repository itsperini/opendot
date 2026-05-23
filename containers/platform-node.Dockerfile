FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY platform/package.json ./platform/package.json
RUN pnpm install --frozen-lockfile

COPY platform ./platform
RUN pnpm --filter ./platform run build:server
RUN pnpm --filter ./platform deploy --legacy --prod /prod/platform

FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app/platform

COPY --from=build /prod/platform ./
COPY --from=build /app/platform/dist-server ./dist-server
COPY --from=build /app/platform/src/server/env.js ./src/server/env.js
COPY --from=build /app/platform/src/server/runtime.js ./src/server/runtime.js
COPY --from=build /app/platform/drizzle ./drizzle

EXPOSE 8787 8788

CMD ["node", "dist-server/server/api.js"]

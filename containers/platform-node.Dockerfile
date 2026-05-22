FROM node:24-alpine AS build

WORKDIR /app/platform

COPY platform/package*.json ./
RUN npm ci

COPY platform ./
RUN npm run build:server
RUN npm prune --omit=dev

FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app/platform

COPY --from=build /app/platform/package*.json ./
COPY --from=build /app/platform/node_modules ./node_modules
COPY --from=build /app/platform/dist-server ./dist-server
COPY --from=build /app/platform/src/server/env.js ./src/server/env.js
COPY --from=build /app/platform/src/server/runtime.js ./src/server/runtime.js
COPY --from=build /app/platform/drizzle ./drizzle

EXPOSE 8787 8788

CMD ["node", "dist-server/server/api.js"]

FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY platform/package.json ./platform/package.json
RUN pnpm install --frozen-lockfile

COPY platform ./platform
WORKDIR /app/platform

ARG VITE_PLATFORM_API_URL=/api
ARG VITE_RUNTIME_WS_URL=ws://localhost:8787/voice
ARG VITE_RUNTIME_HTTP_URL=http://localhost:8787
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=

ENV VITE_PLATFORM_API_URL=$VITE_PLATFORM_API_URL
ENV VITE_RUNTIME_WS_URL=$VITE_RUNTIME_WS_URL
ENV VITE_RUNTIME_HTTP_URL=$VITE_RUNTIME_HTTP_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN pnpm run build

FROM nginx:1.27-alpine

COPY containers/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/platform/dist /usr/share/nginx/html

EXPOSE 80

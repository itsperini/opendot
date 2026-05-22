FROM node:24-alpine AS build

WORKDIR /app/platform

COPY platform/package*.json ./
RUN npm ci

COPY platform ./

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

RUN npm run build

FROM nginx:1.27-alpine

COPY containers/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/platform/dist /usr/share/nginx/html

EXPOSE 80

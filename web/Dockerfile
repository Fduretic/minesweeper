FROM node:22.22.3-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --workspace @arcade/web --include-workspace-root=false
COPY web ./web
RUN npm run build --workspace @arcade/web

FROM nginx:1.28.0-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/nginx-main.conf /etc/nginx/nginx.conf
COPY --from=build /app/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:80/health

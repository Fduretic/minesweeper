FROM node:22.22.3-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --workspace @arcade/api --include-workspace-root=false
COPY api/tsconfig.json api/tsconfig.json
COPY api/src api/src
RUN npm run build --workspace @arcade/api

FROM node:22.22.3-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --workspace @arcade/api --include-workspace-root=false && npm cache clean --force

FROM node:22.22.3-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./api/dist
COPY api/package.json api/db.cjs api/migrate.cjs ./api/
COPY api/migrations ./api/migrations
WORKDIR /app/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node migrate.cjs && exec node --max-old-space-size=384 dist/main.js"]

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY miniapp/api-server/package*.json ./
RUN npm ci
COPY miniapp/api-server/ ./
RUN npm run build && npm prune --omit=dev
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3002 FNS_DATA_DIR=/data/fns CREDIT_DB_PATH=/data/credit/credit.sqlite
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The named volume inherits this ownership, so the non-root process can write SQLite.
RUN mkdir -p /data/credit && chown node:node /data/credit
USER node
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD ["node", "-e", "fetch('http://127.0.0.1:3002/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]

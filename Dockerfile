# Stage 1: Build & Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Final Minimal Runtime Image (< 80MB)
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache su-exec

ENV NODE_ENV=production
ENV PORT=3080

# Setup data directory and permissions
RUN mkdir -p /app/data/uploads && chown -R node:node /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3080
VOLUME ["/app/data"]

# Native zero-dependency health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3080) + '/api/health', (r) => {if (r.statusCode !== 200) process.exit(1);})"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]

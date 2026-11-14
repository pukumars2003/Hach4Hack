FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests so npm can resolve the workspace graph.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci

COPY server/ ./server/
COPY client/ ./client/
RUN npm run build --workspace=server && npm run build --workspace=client

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci --workspace=server --omit=dev

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 10000

CMD ["node", "server/dist/index.js"]
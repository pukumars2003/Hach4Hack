FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and workspace package files
COPY package.json ./
COPY server/package.json ./server/

RUN npm install --workspace=server

COPY server/ ./server/
RUN npm run build --workspace=server

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY server/package.json ./server/

RUN npm install --workspace=server --omit=dev

COPY --from=builder /app/server/dist ./server/dist
COPY server/src/db/migrations ./server/dist/db/migrations

EXPOSE 3000

CMD ["node", "server/dist/index.js"]



FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS production-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 3003

CMD ["node", "dist/main.js"]

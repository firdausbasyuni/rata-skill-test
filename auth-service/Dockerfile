
# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

ENV DATABASE_URL="postgresql://postgres:placeholder@localhost:5432/placeholder"

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig*.json nest-cli.json ./

RUN npx prisma generate

COPY src ./src

RUN npm run build


# Production dependencies
FROM node:24-alpine AS production-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev


# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json ./

EXPOSE 3001

CMD ["node", "dist/main.js"]

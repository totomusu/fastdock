# syntax=docker/dockerfile:1

FROM node:18-alpine AS deps
WORKDIR /app

# Install prod dependencies first (leverages Docker layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3080

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY . .

EXPOSE 3080
CMD ["node", "server.js"]

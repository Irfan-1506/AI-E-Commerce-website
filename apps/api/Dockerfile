# --- deps ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm ci

# --- build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api .
RUN npx prisma generate && npm run build

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Run as non-root — never run production containers as root.
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
USER app
EXPOSE 4000
CMD ["node", "dist/main.js"]

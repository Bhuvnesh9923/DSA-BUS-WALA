# ── Build frontend ──
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Backend runtime ──
FROM node:20-alpine AS backend-runtime
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./

# Copy built frontend into backend's public dir if used for static serving
# (optional — frontend is normally deployed separately on Vercel)
WORKDIR /app
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
WORKDIR /app/backend
EXPOSE 5000
CMD ["node", "server.js"]

# ---------- 1) build do front (Vite) ----------
FROM node:22-alpine AS build
WORKDIR /app
# Cache das dependências
COPY package*.json ./
RUN npm ci
COPY . .
# As variáveis VITE_* são embutidas no bundle durante o build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---------- 2) imagem final: só o servidor estático + dist ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json server.js ./
COPY --from=build /app/dist ./dist
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
USER node
CMD ["npm", "start"]

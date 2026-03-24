# Frontend Dockerfile (Vite build + nginx serve)
FROM node:20-alpine AS build
WORKDIR /app

# Accept build-time env for Vite (VITE_* are statically injected at build)
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=${VITE_API_URL} \
	VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
	VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

COPY Frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY Frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

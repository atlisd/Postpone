FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG VITE_DEBUG=false
ENV VITE_DEBUG=${VITE_DEBUG}
ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

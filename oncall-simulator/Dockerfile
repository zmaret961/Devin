FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build
ENV PORT=4100
EXPOSE 4100
CMD ["npx", "tsx", "server/index.ts"]

# Etapa de build
FROM node:20 AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa de produ��o
FROM node:20-alpine

WORKDIR /app

# Apenas arquivos necess�rios
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm install --omit=dev

ENV NODE_ENV=production

EXPOSE 4497
CMD ["node", "dist/index.js"]

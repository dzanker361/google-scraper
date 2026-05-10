FROM node:20-alpine

WORKDIR /app

# Dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "src/server.js"]

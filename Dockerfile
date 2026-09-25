# Image du serveur de jeu : docker build -t plane-is-out . && docker run -p 8080:8080 -v pio-data:/app/data plane-is-out
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install
COPY . .
RUN node build.mjs
ENV PORT=8080 DATA_DIR=/app/data
EXPOSE 8080
CMD ["node", "server/server.js"]

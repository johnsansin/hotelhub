# --- Backend: Express API ---
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir -p uploads && chown -R node:node /app

EXPOSE 5000

USER node

CMD ["node", "src/index.js"]

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=optional

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && mkdir -p dist/db && cp src/db/schema.sql dist/db/schema.sql && npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]

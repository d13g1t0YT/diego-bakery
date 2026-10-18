FROM node:22-alpine AS build

WORKDIR /workspace

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

# The backend build runs regression tests that import files from app/src and scripts/.
# Copy those sources before npm run build to ensure the test files are available.
COPY app/package*.json ./app/
RUN cd app && npm install
COPY app ./app
COPY scripts ./scripts

RUN npm run build
RUN cd app && npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /workspace/dist ./dist
COPY --from=build /workspace/app/dist ./app-dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]

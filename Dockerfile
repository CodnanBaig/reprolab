FROM node:22.16.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY src ./src
COPY public ./public
COPY scripts/build.mjs ./scripts/build.mjs
RUN node scripts/build.mjs && mkdir -p /app/.data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=4318 DATABASE_PATH=/app/.data/reprolab.sqlite
EXPOSE 4318
CMD ["node", "dist/src/server.js"]

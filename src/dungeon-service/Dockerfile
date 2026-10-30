FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.mjs game-relay.mjs ./
ENV NODE_ENV=production PORT=9000
USER node
EXPOSE 9000
CMD ["node", "server.mjs"]

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@medlink/shared
RUN npm run build --workspace=apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]

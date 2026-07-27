FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
# Both packages/shared/tsconfig.json and apps/api/tsconfig.json extend this.
COPY tsconfig.base.json ./
# packages/shared is copied in full (not just its package.json) before install:
# its `prepare` script runs during `npm install` and needs tsconfig.json + src/
# to be present. That same `prepare` builds its dist/, so no explicit build step
# for it is needed afterwards.
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/package.json
RUN npm install
COPY apps/api apps/api
RUN npm run build --workspace=apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]

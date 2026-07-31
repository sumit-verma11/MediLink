FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
# packages/shared is copied in full (not just its package.json) before install:
# its `prepare` script runs during `npm install` and needs tsconfig.json + src/
# to be present. That same `prepare` builds its dist/, which apps/web imports
# as @medlink/shared -- without this, `next build` fails to resolve it.
COPY packages/shared packages/shared
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/web apps/web
# Next.js inlines NEXT_PUBLIC_* vars into the client bundle at build time, so
# this must be present as an env var during `next build`, not just at runtime.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace=apps/web
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "start"]

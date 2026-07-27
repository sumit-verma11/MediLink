FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/web apps/web
RUN npm run build --workspace=apps/web
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "start"]

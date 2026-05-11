FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: the `prepare` hook runs `npm run build`, but tsconfig.json
# and src/ aren't here yet. We run the build explicitly below.
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.test.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/index.js"]

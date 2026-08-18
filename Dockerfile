FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY server ./server
COPY authenticate ./authenticate
COPY login ./login
COPY --from=build /app/dist ./dist
# The wordmark uses the approved SVG plus a transparent mark bitmap.  Vite
# doesn't copy root-level static files automatically, so keep both assets in
# the runtime image instead of letting the production header lose its logo.
COPY --from=build /app/dialog-logo-final.svg ./dist/dialog-logo-final.svg
COPY --from=build /app/assets/dialog-logo-final.png ./dist/assets/dialog-logo-final.png
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]

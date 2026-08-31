FROM node:24.15.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.15.0-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NAYORI_DOCS_RELEASE=development
ARG NAYORI_DOCS_ORIGIN=https://docs.nayori.ai
ARG NAYORI_APP_ORIGIN=https://app.nayori.ai
ARG NAYORI_PRODUCT_ORIGIN=https://nayori.ai
ARG NAYORI_API_ORIGIN=https://api.nayori.ai
ENV NAYORI_DOCS_RELEASE=$NAYORI_DOCS_RELEASE
ENV NAYORI_DOCS_ORIGIN=$NAYORI_DOCS_ORIGIN
ENV NAYORI_APP_ORIGIN=$NAYORI_APP_ORIGIN
ENV NAYORI_PRODUCT_ORIGIN=$NAYORI_PRODUCT_ORIGIN
ENV NAYORI_API_ORIGIN=$NAYORI_API_ORIGIN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24.15.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ARG NAYORI_DOCS_RELEASE=development
ARG NAYORI_DOCS_ORIGIN=https://docs.nayori.ai
ARG NAYORI_APP_ORIGIN=https://app.nayori.ai
ARG NAYORI_PRODUCT_ORIGIN=https://nayori.ai
ARG NAYORI_API_ORIGIN=https://api.nayori.ai
ENV NAYORI_DOCS_RELEASE=$NAYORI_DOCS_RELEASE
ENV NAYORI_DOCS_ORIGIN=$NAYORI_DOCS_ORIGIN
ENV NAYORI_APP_ORIGIN=$NAYORI_APP_ORIGIN
ENV NAYORI_PRODUCT_ORIGIN=$NAYORI_PRODUCT_ORIGIN
ENV NAYORI_API_ORIGIN=$NAYORI_API_ORIGIN

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:24.22.1-alpine
RUN apk add --no-cache su-exec
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server.mjs ./
COPY remote ./remote
RUN mkdir /data && chown node:node /data
COPY --chmod=755 remote/start.sh /usr/local/bin/orbit-start
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/orbit-start"]

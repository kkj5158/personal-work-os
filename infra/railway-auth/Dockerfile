FROM caddy:2.11.7-alpine AS proxy
FROM supabase/gotrue:v2.197.0
USER root
RUN apk add --no-cache tini
COPY --from=proxy /usr/bin/caddy /usr/local/bin/caddy
COPY Caddyfile /etc/pos-auth/Caddyfile
COPY --chmod=755 start.sh /usr/local/bin/pos-auth-start
RUN PORT=8080 POS_AUTH_PUBLISHABLE_KEY=build-validation-public-key caddy validate --config /etc/pos-auth/Caddyfile --adapter caddyfile
USER supabase
ENV PORT=8080 GOTRUE_API_HOST=127.0.0.1 GOTRUE_API_PORT=9999
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "-g", "--", "/usr/local/bin/pos-auth-start"]

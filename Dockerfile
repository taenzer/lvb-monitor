# LVB-Abfahrtsmonitor – Produktions-Image
# Keine Abhängigkeiten, kein Build-Schritt: Node plus server.js, package.json und public/.

FROM node:24-alpine

# Von der Pipeline gesetzt: Release-Tag als Version, Build-Infos
ARG APP_VERSION=dev
ARG BUILD_NR=
ARG BUILD_DATE=

LABEL org.opencontainers.image.title="lvb-monitor" \
      org.opencontainers.image.description="Live-Abfahrten an LVB-Haltestellen in Leipzig" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION} \
    BUILD_NR=${BUILD_NR} \
    BUILD_DATE=${BUILD_DATE}

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

# Nicht als root laufen (der Benutzer "node" ist im Image vorhanden)
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["node", "server.js"]

FROM node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Fumadocs' postinstall needs source.config.ts and the content tree.
COPY . .
RUN npm ci
# The revision is optional: DigitalOcean's source builds (deploy on push from
# skysay-ai/skysay-docs) pass no build argument, and the header is simply
# omitted then. When a value is given it must be a full commit sha.
ARG DOCS_REVISION=""
ENV SKYSAY_DOCS_REVISION=$DOCS_REVISION
RUN node -e 'const r = process.env.SKYSAY_DOCS_REVISION || ""; if (r && !/^[0-9a-f]{40}$/.test(r)) process.exit(1)'
RUN npm run build
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start"]

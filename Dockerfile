FROM node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Fumadocs' postinstall needs source.config.ts and the content tree.
COPY . .
RUN npm ci
ARG DOCS_REVISION
ENV OPENPHONEX_DOCS_REVISION=$DOCS_REVISION
RUN node -e 'if (!/^[0-9a-f]{40}$/.test(process.env.OPENPHONEX_DOCS_REVISION)) process.exit(1)'
RUN npm run build
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start"]

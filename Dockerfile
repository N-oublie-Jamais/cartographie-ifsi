FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
EXPOSE 8787
CMD ["node","server.mjs"]

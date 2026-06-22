ARG BUILD_FROM
FROM ${BUILD_FROM}

# Node runs the sync server; git + ca-certificates push to GitHub over HTTPS.
# No npm install needed — the server has zero dependencies.
RUN apk add --no-cache nodejs git ca-certificates

# The app/server code itself is cloned from GitHub at runtime into the
# persistent /data, so the image stays tiny and updates with a restart.
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

# Measures whether noon answers from Railway's IPs.
#
# Diagnostic only, and throwaway: it reads five product pages we already hold,
# writes nothing, publishes nothing, and touches no database. Delete this
# directory once the hosting question is settled.
#
# Playwright's own image so Chromium and its system libraries are already
# present and version-matched — installing them by hand is where this normally
# goes wrong.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /probe

# Only the probe and Playwright are needed; the app's dependencies are not.
RUN npm init -y >/dev/null 2>&1 && npm i --no-save playwright@1.61.1

COPY scripts/import/noon-access-test.mjs ./noon-access-test.mjs
COPY railway-probe/serve.mjs ./serve.mjs

# Railway restarts a container that exits, which would re-run the probe in a
# loop. So it runs once and then serves the result over HTTP instead: open the
# service URL to read it, rather than hunting through deploy logs.
ENV LIMIT=5
CMD ["node", "serve.mjs"]

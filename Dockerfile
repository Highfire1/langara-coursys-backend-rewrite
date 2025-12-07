FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# FROM base AS install
# COPY package.json bun.lockb ./
# RUN bun install --frozen-lockfile

# FROM base AS release
# COPY --from=install /usr/src/app/node_modules node_modules
COPY . .

USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "index.ts"]

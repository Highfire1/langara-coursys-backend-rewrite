FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Create data directory with proper ownership for bun user
RUN mkdir -p /usr/src/app/data && chown -R bun:bun /usr/src/app/data

USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "index.ts"]

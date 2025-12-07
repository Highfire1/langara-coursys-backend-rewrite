FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies
COPY package.json ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "index.ts"]

FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

RUN mkdir -p /usr/src/app/data

EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "index.ts"]

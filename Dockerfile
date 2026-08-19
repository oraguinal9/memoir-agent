# ---- 构建镜像 ----
# 语法：docker build -t memoir-agent .
# 运行：docker run -d -p 3000:3000 -v memoir-data:/app/data -e LLM_API_KEY=sk-xxx --name memoir memoir-agent

FROM node:22-alpine AS base
WORKDIR /app

# 安装依赖（利用缓存层）
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 构建
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 运行（standalone 产物，仅含运行时依赖）
FROM node:22-alpine AS run
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV DATA_DIR=/app/data
WORKDIR /app

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# 数据目录（持久卷）
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
USER node
CMD ["node", "server.js"]

# syntax=docker/dockerfile:1.7-labs

# ---------------------------
# deps: 安装依赖
# ---------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------------------------
# build: 编译 TypeScript → dist/
# ---------------------------
FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npm run build

# ---------------------------
# runtime: 最小运行环境
# ---------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# 安装生产依赖（使用 lockfile）
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 拷贝运行所需产物与元数据
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node /app/package.json ./package.json

# 预创建可写数据目录，使用非 root 用户
RUN mkdir -p /app/data && chown -R node:node /app
USER node

# 直接作为 CLI 使用：容器参数即子命令
ENTRYPOINT ["node","dist/index.js"]

 

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

# ---- 1. 构建阶段 (Builder Stage) ----
# 使用一个包含完整 Node.js 和 npm/yarn 工具链的官方镜像
# 'alpine' 版本更小，适合构建
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json
# 这样做可以利用 Docker 的层缓存。只要这两个文件没有变化，npm install 就不会重新执行。
COPY package*.json ./

# 安装所有依赖，包括开发依赖 (devDependencies)，因为构建过程需要它们 (如 typescript, ts-node)
RUN npm install

# 复制项目的其余所有文件
COPY . .

# 执行构建命令，将 TypeScript 编译成 JavaScript
# 编译后的文件会输出到 /dist 目录
RUN npm run build


# ---- 2. 生产阶段 (Production Stage) ----
# 使用一个轻量的 Node.js 镜像作为最终的运行环境
FROM node:18-alpine

# 设置工作目录
WORKDIR /usr/src/app

# 为了安全，创建一个非 root 用户来运行应用
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 只安装生产环境所必需的依赖 (dependencies)
# --omit=dev 标志会跳过 devDependencies
RUN npm install --omit=dev

# 从构建阶段 (builder) 复制编译好的代码到当前阶段
COPY --from=builder /usr/src/app/dist ./dist

# 从构建阶段复制数据目录，以确保它在容器中存在
COPY --from=builder /usr/src/app/data ./data

# 复制 .env.example 文件，方便用户在容器启动时配置环境变量
COPY .env.example .

# 切换到非 root 用户
USER appuser

# 设置容器的入口点 (Entrypoint)
# 当容器启动时，会执行 'node dist/index.js'
# 你可以在 'docker run' 命令后面追加参数，例如 'agents', 'follow xxx' 等
ENTRYPOINT ["node", "dist/index.js"]

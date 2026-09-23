# 词径 WordPath 生产镜像：单进程托管 SPA + API（SQLite 落盘 /app/data）
# 运行要求：Node >= 22.5（node:sqlite 内置模块）
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=8787
ENV WORDPATH_DB=/app/data/wordpath.db
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
# 词书查找：dist/server/db 向上命中 /app/assets/wordbooks（seed 内建向上探测）
CMD ["npm", "start"]

# 阿里云部署手册（轻量应用服务器，从购买到上线）

> 适用：阿里云轻量应用服务器 + Docker Compose（仓库已含 `docker-compose.yml` / `Caddyfile.example`）。
> 全程约 30 分钟操作 + 备案等待 7-20 天（等待期间可先用 IP 测试）。

## 1. 购买服务器（~5 分钟）

1. 阿里云控制台 → 搜索「**轻量应用服务器**」→ 创建服务器（新用户通常有 2核2G 约 ¥38-99/年 的首年促销，以页面为准）
2. 配置选择：
   - **地域**：离用户近的国内节点（杭州/北京/上海/深圳）
   - **镜像**：应用镜像里优先选「**Docker**」（预装 Docker + Compose）；没有就选 **Ubuntu 24.04**，第 3 步里手装
   - **时长**：≥3 个月（备案要求；促销一般按年起售）
   - 设置并记录 root 密码、公网 IP
3. 实例页 → 「防火墙」：确认 **80 / 443 / 22** 已放行（临时测试期再加一条 **8080**）

## 2. 购买域名 + ICP 备案（1-2 周，与第 3 步并行）

1. 阿里云 → 「**域名注册**」购买（.com/.cn，¥30-80/年），完成域名实名认证
2. 域名解析控制台：添加 **A 记录** → 指向服务器公网 IP（现在就可以加，备案下来才对外生效）
3. 控制台搜「**ICP 备案**」：
   - 先在轻量服务器实例页申请「**备案服务码**」（免费，要求服务器包月 ≥3 个月）
   - 按流程填写主体与网站信息 → 阿里云初审 → 管局审核，一般 **7-20 天**
4. 备案期间可用 `http://<IP>:8080` 测试，不影响进度

## 3. 部署应用（备案等待期间即可）

SSH 登录后执行（选 Ubuntu 镜像且未预装 Docker 时先装）：

```bash
# 安装 Docker（预装 Docker 镜像可跳过）
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh --mirror Aliyun

# 拉取代码（GitHub 从国内拉取慢/失败时，用下方 rsync 方案）
git clone https://github.com/xuke1128/wordpath /opt/wordpath && cd /opt/wordpath

# —— 临时体验模式（备案前）：只跑应用容器，走 8080 端口 ——
docker build -t wordpath .
docker run -d --name wordpath-test -p 8080:8787 -v wordpath-data:/app/data --restart unless-stopped wordpath
# 防火墙放行 8080 后，浏览器访问 http://<IP>:8080 验证（首启自动播种 21,237 词）
```

GitHub 拉取失败时，在**自己的 Mac** 上传（项目已在本地）：

```bash
rsync -avz --exclude node_modules --exclude .git --exclude data \
  "/Users/bytedance/Documents/ZCode/APP 0921/apps/wordpath/" root@<服务器IP>:/opt/wordpath/
```

## 4. 备案通过 → 正式上线（域名 + 自动 HTTPS）

```bash
cd /opt/wordpath
cp Caddyfile.example Caddyfile
sed -i 's/<你的域名>/word.example.com/' Caddyfile      # 换成你的域名
echo 'WORDPATH_DOMAIN=word.example.com' > .env

# 关掉临时测试容器，切换正式栈（应用 + Caddy 自动签发证书）
docker rm -f wordpath-test
docker compose up -d --build

curl -I https://word.example.com/api/health   # HTTP/2 200 即成功
```

防火墙的 8080 规则此时可删除。

## 5. 验收与分享

- 手机/电脑浏览器打开 `https://你的域名` → 体验登录 → 选词书 → 学几个词 → 统计页看排行榜
- 数据持久在 `wordpath-data` 卷，重启/重新部署不丢

## 日常运维

```bash
cd /opt/wordpath
git pull && docker compose up -d --build                # 更新版本
docker compose logs -f app                              # 看日志
docker run --rm -v wordpath-data:/data alpine tar czf - -C /data . > backup-$(date +%F).tar.gz   # 备份
```

## 微信登录（可选，备案 + 开放平台审核后）

在 `/opt/wordpath/.env` 追加三项后 `docker compose up -d`（凭据只放服务器环境变量，不入仓库）：

```
WECHAT_APPID=wx...
WECHAT_SECRET=...
WECHAT_REDIRECT_URI=https://word.example.com/api/auth/wechat/callback
```

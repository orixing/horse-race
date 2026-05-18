#!/bin/bash
# 摇摇赛马 — 服务端一键部署脚本
# 用法: ./deploy.sh

SERVER="admin@8.222.139.214"
REMOTE_DIR="/opt/horse-race"

echo "=== 上传服务端代码 ==="
scp -r server/src server/package.json "$SERVER:$REMOTE_DIR/server/"

echo "=== 上传共享代码 ==="
scp src/RagdollHorse.js src/i18n.js "$SERVER:$REMOTE_DIR/src/"
scp src/config/constants.js "$SERVER:$REMOTE_DIR/src/config/"

echo "=== 安装依赖并重启 ==="
ssh "$SERVER" "cd $REMOTE_DIR/server && npm install --production && pm2 restart horse-server"

echo "=== 完成 ==="
ssh "$SERVER" "pm2 logs horse-server --lines 5 --nostream"

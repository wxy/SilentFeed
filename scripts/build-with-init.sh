#!/bin/bash

# 生产构建脚本 - 简化版
# 根据观察：npm run dev 成功后，npm run build 也能成功
# 解决方案：直接在 build 前运行一次 dev，然后运行 build

set -euo pipefail

echo "🔨 开始生产构建..."
echo "  步骤 1/3: 准备 DNR 文件..."

bash scripts/pre-build-dnr.sh

echo "  步骤 2/3: 预热 (运行 dev 初始化缓存，最多60秒)..."
# 在后台运行 dev，等待 .plasmo 清单生成
npm run dev > /tmp/build-warmup.log 2>&1 &
DEV_PID=$!

# 等待 .plasmo 清单文件生成（最多 60 秒）
for i in {1..120}; do
  if [ -f .plasmo/chrome-mv3.plasmo.manifest.json ]; then
    echo "✓ .plasmo 清单已初始化"
    break
  fi
  sleep 0.5
done

# 关键：确保 dnr-rules.json 在 .plasmo 中（build 从这里找）
if [ -f dnr-rules.json ] && [ ! -f .plasmo/dnr-rules.json ]; then
  cp dnr-rules.json .plasmo/dnr-rules.json
  echo "✓ 已将 dnr-rules.json 复制到 .plasmo"
fi

# 杀掉 dev 进程
kill -9 $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true
sleep 1

echo "  步骤 3/3: 运行 Plasmo 构建..."
npx plasmo build

# 复制国际化资源
bash scripts/copy-locales.sh

echo "✅ 构建完成！"


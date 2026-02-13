#!/bin/bash

# 生产构建脚本 - 简化版
# 根据观察：npm run dev 成功后，npm run build 也能成功
# 解决方案：直接在 build 前运行一次 dev，然后运行 build

set -euo pipefail

echo "🔨 开始生产构建..."
echo "  步骤 1/3: 准备 DNR 文件..."

bash scripts/pre-build-dnr.sh

echo "  步骤 2/3: 预热 (运行 dev 初始化缓存)..."
# 运行 dev，30 秒后自动超时并继续
timeout 30 npm run dev 2>&1 | head -20 || true

echo "  步骤 3/3: 运行 Plasmo 构建..."
npx plasmo build

# 复制国际化资源
bash scripts/copy-locales.sh

echo "✅ 构建完成！"


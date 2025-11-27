#!/bin/bash

# 监听开发构建目录，自动配置 DNR
# 在 plasmo dev 模式下使用

BUILD_DIR="build/chrome-mv3-dev"
MANIFEST="$BUILD_DIR/manifest.json"

echo "🔍 监听开发构建目录: $BUILD_DIR"

# 等待构建目录创建
while [ ! -d "$BUILD_DIR" ]; do
  sleep 1
done

echo "✅ 构建目录已创建"

# 等待 manifest.json 创建
while [ ! -f "$MANIFEST" ]; do
  sleep 1
done

echo "✅ manifest.json 已创建，开始配置 DNR..."

# 配置 DNR
bash scripts/setup-dnr.sh

echo "✅ DNR 配置完成，监听结束"

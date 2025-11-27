#!/bin/bash

# 设置 declarative_net_request 配置到构建后的 manifest.json
# 这个脚本在 plasmo build 之后运行

set -e

# 处理生产构建
BUILD_DIR_PROD="build/chrome-mv3-prod"
MANIFEST_PROD="$BUILD_DIR_PROD/manifest.json"

# 处理开发构建
BUILD_DIR_DEV="build/chrome-mv3-dev"
MANIFEST_DEV="$BUILD_DIR_DEV/manifest.json"

# DNR 配置 JSON
DNR_CONFIG='{
  "declarative_net_request": {
    "rule_resources": [
      {
        "id": "ollama-cors-fix",
        "enabled": true,
        "path": "dnr-rules.json"
      }
    ]
  }
}'

# 处理生产构建
if [ -f "$MANIFEST_PROD" ]; then
  echo "📝 添加 DNR 配置到 $MANIFEST_PROD..."
  jq ". + $DNR_CONFIG" "$MANIFEST_PROD" > "${MANIFEST_PROD}.tmp" && mv "${MANIFEST_PROD}.tmp" "$MANIFEST_PROD"
  cp public/dnr-rules.json "$BUILD_DIR_PROD/"
  echo "✅ 生产构建 DNR 配置完成"
fi

# 处理开发构建
if [ -f "$MANIFEST_DEV" ]; then
  echo "📝 添加 DNR 配置到 $MANIFEST_DEV..."
  jq ". + $DNR_CONFIG" "$MANIFEST_DEV" > "${MANIFEST_DEV}.tmp" && mv "${MANIFEST_DEV}.tmp" "$MANIFEST_DEV"
  cp public/dnr-rules.json "$BUILD_DIR_DEV/"
  echo "✅ 开发构建 DNR 配置完成"
fi

echo "✅ DNR 配置完成"

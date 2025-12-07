#!/bin/bash

# 构建后处理：注入 DNR 配置到 manifest.json 并复制规则文件
# Plasmo 无法在构建时验证 dnr-rules.json，所以我们在构建后处理

set -euo pipefail

if ! command -v jq &> /dev/null; then
  echo "❌ 需要 jq，请安装: brew install jq"
  exit 1
fi

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

DNR_SOURCE="dnr-rules.json"

echo "📋 处理 DNR 配置..."

# 处理生产构建
if [ -f "build/chrome-mv3-prod/manifest.json" ]; then
  echo "  → 注入到生产构建 manifest..."
  jq ". + $DNR_CONFIG" build/chrome-mv3-prod/manifest.json > build/chrome-mv3-prod/manifest.json.tmp
  mv build/chrome-mv3-prod/manifest.json.tmp build/chrome-mv3-prod/manifest.json
  cp "$DNR_SOURCE" build/chrome-mv3-prod/
  echo "  ✅ 生产构建完成"
fi

# 处理开发构建
if [ -f "build/chrome-mv3-dev/manifest.json" ]; then
  echo "  → 注入到开发构建 manifest..."
  jq ". + $DNR_CONFIG" build/chrome-mv3-dev/manifest.json > build/chrome-mv3-dev/manifest.json.tmp
  mv build/chrome-mv3-dev/manifest.json.tmp build/chrome-mv3-dev/manifest.json
  cp "$DNR_SOURCE" build/chrome-mv3-dev/
  echo "  ✅ 开发构建完成"
fi

echo "✅ DNR 配置完成"

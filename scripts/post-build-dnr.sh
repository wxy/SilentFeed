#!/bin/bash

# 构建后处理：注入 DNR 配置并复制规则文件
# 这个脚本在 plasmo build 完成后执行，此时所有文件都已生成

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

DNR_SOURCE="public/dnr-rules.json"

# 处理生产构建
if [ -f "build/chrome-mv3-prod/manifest.json" ]; then
  echo "📝 注入 DNR 配置到生产构建..."
  jq ". + $DNR_CONFIG" build/chrome-mv3-prod/manifest.json > build/chrome-mv3-prod/manifest.json.tmp
  mv build/chrome-mv3-prod/manifest.json.tmp build/chrome-mv3-prod/manifest.json
  cp "$DNR_SOURCE" build/chrome-mv3-prod/
  echo "✅ 生产构建 DNR 配置完成"
fi

# 处理开发构建
if [ -f "build/chrome-mv3-dev/manifest.json" ]; then
  if ! grep -q '"declarative_net_request"' build/chrome-mv3-dev/manifest.json; then
    echo "📝 注入 DNR 配置到开发构建..."
    jq ". + $DNR_CONFIG" build/chrome-mv3-dev/manifest.json > build/chrome-mv3-dev/manifest.json.tmp
    mv build/chrome-mv3-dev/manifest.json.tmp build/chrome-mv3-dev/manifest.json
    cp "$DNR_SOURCE" build/chrome-mv3-dev/
    echo "✅ 开发构建 DNR 配置完成"
  else
    echo "ℹ️  开发构建已包含 DNR 配置"
  fi
fi

echo "✅ DNR 后处理完成"

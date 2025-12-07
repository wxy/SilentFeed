#!/bin/bash

# 在构建完成后为 manifest.json 注入 declarative_net_request 配置

set -euo pipefail

if ! command -v jq &> /dev/null; then
  echo "❌ 运行 setup-dnr.sh 需要 jq，请先安装: brew install jq"
  exit 1
fi

BUILD_DIR_PROD="build/chrome-mv3-prod"
MANIFEST_PROD="$BUILD_DIR_PROD/manifest.json"

BUILD_DIR_DEV="build/chrome-mv3-dev"
MANIFEST_DEV="$BUILD_DIR_DEV/manifest.json"

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

apply_dnr_config() {
  local build_dir="$1"
  local manifest_path="$2"
  local label="$3"

  # 等待构建目录创建（最多等 30 秒）
  local timeout=30
  while [ ! -d "$build_dir" ] && [ $timeout -gt 0 ]; do
    sleep 1
    timeout=$((timeout - 1))
  done

  if [ ! -d "$build_dir" ]; then
    echo "⚠️  ${label} 构建目录未找到，跳过: $build_dir"
    return
  fi

  # 等待 manifest.json 文件生成（最多等 30 秒）
  timeout=30
  while [ ! -f "$manifest_path" ] && [ $timeout -gt 0 ]; do
    sleep 1
    timeout=$((timeout - 1))
  done

  if [ ! -f "$manifest_path" ]; then
    echo "⚠️  ${label} manifest 未找到，跳过: $manifest_path"
    return
  fi

  mkdir -p "$build_dir"

  if grep -q '"declarative_net_request"' "$manifest_path"; then
    echo "ℹ️  ${label} 已包含 DNR 配置，保持现状"
  else
    echo "📝 为 ${label} 注入 DNR 配置..."
    jq ". + $DNR_CONFIG" "$manifest_path" > "${manifest_path}.tmp" && mv "${manifest_path}.tmp" "$manifest_path"
    echo "✅ ${label} DNR 配置完成"
  fi

  cp public/dnr-rules.json "$build_dir/"
}

apply_dnr_config "$BUILD_DIR_PROD" "$MANIFEST_PROD" "生产构建"
apply_dnr_config "$BUILD_DIR_DEV" "$MANIFEST_DEV" "开发构建"

echo "✅ DNR 配置完成"

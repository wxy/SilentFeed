#!/bin/bash

# 持续监听开发构建目录，在 manifest.json 变化时自动配置 DNR
# 在 plasmo dev 模式下使用

BUILD_DIR="build/chrome-mv3-dev"
MANIFEST="$BUILD_DIR/manifest.json"
DNR_RULES="$BUILD_DIR/dnr-rules.json"

echo "🔍 监听开发构建目录: $BUILD_DIR"

# 等待构建目录创建
while [ ! -d "$BUILD_DIR" ]; do
  sleep 0.5
done

echo "✅ 构建目录已创建"

# DNR 配置函数
apply_dnr_config() {
  if [ -f "$MANIFEST" ]; then
    # 检查是否已经有 DNR 配置
    if grep -q '"declarative_net_request"' "$MANIFEST"; then
      return 0  # 已配置，跳过
    fi
    
    echo "📝 添加 DNR 配置到开发构建..."
    
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
    
    jq ". + $DNR_CONFIG" "$MANIFEST" > "${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "$MANIFEST"
    cp public/dnr-rules.json "$BUILD_DIR/"
    echo "✅ DNR 配置完成"
  fi
}

# 初始配置
while [ ! -f "$MANIFEST" ]; do
  sleep 0.5
done

echo "✅ manifest.json 已创建，开始配置 DNR..."
apply_dnr_config

# 持续监听 manifest.json 变化
echo "👀 持续监听 manifest.json 变化..."
fswatch -o "$MANIFEST" 2>/dev/null | while read; do
  echo "🔄 检测到 manifest.json 变化，重新应用 DNR 配置..."
  sleep 0.2  # 等待文件写入完成
  apply_dnr_config
done &

# 如果 fswatch 不可用，使用轮询方式
if ! command -v fswatch &> /dev/null; then
  echo "⚠️  fswatch 未安装，使用轮询方式监听（效率较低）"
  echo "   提示：安装 fswatch 可提高性能: brew install fswatch"
  
  LAST_MTIME=$(stat -f %m "$MANIFEST" 2>/dev/null || stat -c %Y "$MANIFEST" 2>/dev/null)
  while true; do
    sleep 2
    CURRENT_MTIME=$(stat -f %m "$MANIFEST" 2>/dev/null || stat -c %Y "$MANIFEST" 2>/dev/null)
    if [ "$CURRENT_MTIME" != "$LAST_MTIME" ]; then
      echo "🔄 检测到 manifest.json 变化，重新应用 DNR 配置..."
      apply_dnr_config
      LAST_MTIME=$CURRENT_MTIME
    fi
  done
fi

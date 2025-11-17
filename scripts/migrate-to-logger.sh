#!/bin/bash

# 批量迁移 console 调用到 logger
# 用法: ./scripts/migrate-to-logger.sh <文件路径> <模块标签>

set -e

FILE=$1
TAG=$2

if [ -z "$FILE" ] || [ -z "$TAG" ]; then
  echo "用法: $0 <文件路径> <模块标签>"
  echo "示例: $0 src/core/ai/AICapabilityManager.ts AICapabilityManager"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "错误: 文件不存在 $FILE"
  exit 1
fi

echo "🔧 迁移文件: $FILE"
echo "📝 模块标签: $TAG"

# 1. 检查是否已经导入 logger
if ! grep -q "import.*logger.*from.*utils/logger" "$FILE"; then
  echo "✅ 添加 logger 导入"
  
  # 查找第一个 import 语句的位置
  FIRST_IMPORT_LINE=$(grep -n "^import" "$FILE" | head -1 | cut -d: -f1)
  
  if [ -n "$FIRST_IMPORT_LINE" ]; then
    # 在第一个 import 后面插入
    sed -i '' "${FIRST_IMPORT_LINE}a\\
import { logger } from '../../utils/logger'\\
\\
// 创建带标签的 logger\\
const ${TAG}Logger = logger.withTag('$TAG')\\
" "$FILE"
  else
    # 没有 import，在文件开头插入（跳过注释）
    FIRST_CODE_LINE=$(grep -n "^[^/\*]" "$FILE" | head -1 | cut -d: -f1)
    sed -i '' "${FIRST_CODE_LINE}i\\
import { logger } from '../../utils/logger'\\
\\
// 创建带标签的 logger\\
const ${TAG}Logger = logger.withTag('$TAG')\\
\\
" "$FILE"
  fi
else
  echo "ℹ️  已存在 logger 导入，跳过"
fi

# 2. 替换 console 调用
echo "🔄 替换 console 调用..."

# 统计替换前的数量
BEFORE_COUNT=$(grep -c "console\." "$FILE" || echo "0")

# 批量替换
sed -i '' \
  -e "s/console\.log('\[$TAG\]/${TAG}Logger.info('/g" \
  -e "s/console\.log(\"\[$TAG\]/\${TAG}Logger.info(\"/g" \
  -e "s/console\.log(\`\[$TAG\]/${TAG}Logger.info(\`/g" \
  -e "s/console\.info('\[$TAG\]/\${TAG}Logger.info('/g" \
  -e "s/console\.info(\"\[$TAG\]/\${TAG}Logger.info(\"/g" \
  -e "s/console\.info(\`\[$TAG\]/${TAG}Logger.info(\`/g" \
  -e "s/console\.warn('\[$TAG\]/\${TAG}Logger.warn('/g" \
  -e "s/console\.warn(\"\[$TAG\]/\${TAG}Logger.warn(\"/g" \
  -e "s/console\.warn(\`\[$TAG\]/${TAG}Logger.warn(\`/g" \
  -e "s/console\.error('\[$TAG\]/\${TAG}Logger.error('/g" \
  -e "s/console\.error(\"\[$TAG\]/\${TAG}Logger.error(\"/g" \
  -e "s/console\.error(\`\[$TAG\]/${TAG}Logger.error(\`/g" \
  "$FILE"

# 统计替换后的数量
AFTER_COUNT=$(grep -c "console\." "$FILE" || echo "0")
REPLACED=$((BEFORE_COUNT - AFTER_COUNT))

echo "✅ 完成替换: $REPLACED 处"
echo "   替换前: $BEFORE_COUNT 处 console 调用"
echo "   替换后: $AFTER_COUNT 处 console 调用"

if [ "$AFTER_COUNT" -gt 0 ]; then
  echo ""
  echo "⚠️  仍有未替换的 console 调用:"
  grep -n "console\." "$FILE" || true
fi

#!/bin/bash

# 批量替换 poolStatus='popup' 为 'recommended'
# 排除文档和迁移代码

echo "开始批量替换..."

# 要处理的文件列表
files=(
  "src/storage/db/db-stats.ts"
  "src/storage/db/db-feeds.ts"
  "src/background.ts"
  "src/background/refill-scheduler.ts"
  "src/storage/system-stats.ts"
  "src/components/settings/CollectionStats.tsx"
)

# 执行替换
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "处理: $file"
    # 替换 poolStatus === 'popup'
    sed -i '' "s/poolStatus === 'popup'/poolStatus === 'recommended'/g" "$file"
    # 替换 poolStatus === \"popup\"
    sed -i '' 's/poolStatus === "popup"/poolStatus === "recommended"/g' "$file"
    # 替换 poolStatus: 'popup'
    sed -i '' "s/poolStatus: 'popup'/poolStatus: 'recommended'/g" "$file"
  else
    echo "⚠️  文件不存在: $file"
  fi
done

echo "✅ 批量替换完成！"

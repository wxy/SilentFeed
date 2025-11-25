#!/bin/bash
# 构建后脚本：复制 _locales 目录到构建输出

echo "📁 Copying _locales directory..."

# 复制到生产构建目录
if [ -d "public/_locales" ]; then
  cp -r public/_locales build/chrome-mv3-prod/_locales
  echo "✅ Copied _locales to build/chrome-mv3-prod/"
fi

# 复制到开发构建目录（如果存在）
if [ -d "build/chrome-mv3-dev" ] && [ -d "public/_locales" ]; then
  cp -r public/_locales build/chrome-mv3-dev/_locales
  echo "✅ Copied _locales to build/chrome-mv3-dev/"
fi

echo "✅ _locales copy complete!"

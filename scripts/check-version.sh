#!/bin/bash
# 版本号检查脚本
# 在 git push 前检查是否需要更新版本号

set -e

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 如果是 master 或 develop 分支，跳过检查
if [[ "$CURRENT_BRANCH" == "master" || "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "develop" ]]; then
  exit 0
fi

# 获取当前版本
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')

# 获取 master 分支版本
git fetch origin master --quiet 2>/dev/null || true
MASTER_VERSION=$(git show origin/master:package.json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": "\(.*\)".*/\1/' || echo "$CURRENT_VERSION")

# 如果版本号已更新，通过检查
if [[ "$CURRENT_VERSION" != "$MASTER_VERSION" ]]; then
  echo -e "${GREEN}✓ 版本号已更新: $MASTER_VERSION → $CURRENT_VERSION${NC}"
  exit 0
fi

# 分析提交信息，建议版本类型
COMMITS=$(git log origin/master..HEAD --pretty=format:"%s" 2>/dev/null || echo "")
SUGGESTED_TYPE="patch"

if echo "$COMMITS" | grep -qE "(BREAKING|^feat.*!:|^[^:]+!:)"; then
  SUGGESTED_TYPE="major"
elif echo "$COMMITS" | grep -qE "^feat"; then
  SUGGESTED_TYPE="minor"
fi

# 计算建议版本号
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $SUGGESTED_TYPE in
  major)
    SUGGESTED_VERSION="$((MAJOR + 1)).0.0"
    TYPE_DESC="${RED}💥 重大变更${NC}"
    ;;
  minor)
    SUGGESTED_VERSION="$MAJOR.$((MINOR + 1)).0"
    TYPE_DESC="${BLUE}✨ 新功能${NC}"
    ;;
  patch)
    SUGGESTED_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
    TYPE_DESC="${GREEN}🐛 修复${NC}"
    ;;
esac

# 显示提示
echo ""
echo -e "${YELLOW}⚠️  版本号检查${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "当前版本: ${BLUE}$CURRENT_VERSION${NC}"
echo -e "建议类型: $TYPE_DESC"
echo -e "建议版本: ${GREEN}$SUGGESTED_VERSION${NC}"
echo ""
echo "是否需要更新版本号？"
echo "  ${GREEN}1)${NC} 是，使用建议版本 ($SUGGESTED_VERSION)"
echo "  ${BLUE}2)${NC} 自定义版本号"
echo "  ${YELLOW}3)${NC} 暂时跳过（稍后更新）"
echo ""

read -p "请选择 (1/2/3，默认3): " choice

case $choice in
  1)
    echo -e "${GREEN}正在更新版本到 $SUGGESTED_VERSION...${NC}"
    case $SUGGESTED_TYPE in
      major) npm run version:major --silent ;;
      minor) npm run version:minor --silent ;;
      patch) npm run version:patch --silent ;;
    esac
    echo -e "${GREEN}✓ 版本已更新${NC}"
    ;;
  2)
    read -p "请输入版本号 (当前: $CURRENT_VERSION): " CUSTOM_VERSION
    if [[ -n "$CUSTOM_VERSION" ]]; then
      # 更新 package.json
      sed -i.bak "s/\"version\": \".*\"/\"version\": \"$CUSTOM_VERSION\"/" package.json && rm package.json.bak
      git add package.json
      git commit -m "chore: 发布 v$CUSTOM_VERSION" --no-verify
      echo -e "${GREEN}✓ 版本已更新到 $CUSTOM_VERSION${NC}"
    fi
    ;;
  *)
    echo -e "${YELLOW}⚠️  跳过版本更新${NC}"
    echo -e "${YELLOW}   提醒: PR 合并前请更新版本号${NC}"
    ;;
esac

exit 0

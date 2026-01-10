#!/bin/bash
# 智能 PR 创建脚本
# 自动分析变更、建议版本号、更新版本并创建 PR

set -e

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🤫 Silent Feed - 智能 PR 创建器     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# 检查是否有未提交的更改
if [[ -n $(git status -s) ]]; then
  echo -e "${RED}❌ 有未提交的更改，请先提交${NC}"
  git status -s
  exit 1
fi

# 获取当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$CURRENT_BRANCH" == "master" || "$CURRENT_BRANCH" == "main" ]]; then
  echo -e "${RED}❌ 不能从 master 分支创建 PR${NC}"
  exit 1
fi

echo -e "${BLUE}📝 当前分支:${NC} $CURRENT_BRANCH"
echo ""

# 获取版本信息
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
git fetch origin master --quiet 2>/dev/null || true
MASTER_VERSION=$(git show origin/master:package.json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": "\(.*\)".*/\1/' || echo "$CURRENT_VERSION")

# 分析提交
COMMITS=$(git log origin/master..HEAD --oneline)
COMMIT_COUNT=$(echo "$COMMITS" | wc -l | xargs)
echo -e "${BLUE}📊 变更统计:${NC}"
echo "$COMMITS" | sed 's/^/  /'
echo ""
echo -e "${BLUE}提交数量:${NC} $COMMIT_COUNT"
echo ""

# 分析变更类型
COMMIT_MESSAGES=$(git log origin/master..HEAD --pretty=format:"%s")
SUGGESTED_TYPE="patch"
TYPE_REASON="修复或小改动"

if echo "$COMMIT_MESSAGES" | grep -qE "(BREAKING|^feat.*!:|^[^:]+!:)"; then
  SUGGESTED_TYPE="major"
  TYPE_REASON="包含破坏性变更"
elif echo "$COMMIT_MESSAGES" | grep -qE "^feat"; then
  SUGGESTED_TYPE="minor"
  TYPE_REASON="包含新功能"
fi

# 计算建议版本
IFS='.' read -ra VERSION_PARTS <<< "$MASTER_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $SUGGESTED_TYPE in
  major)
    SUGGESTED_VERSION="$((MAJOR + 1)).0.0"
    TYPE_EMOJI="💥"
    TYPE_NAME="Major"
    ;;
  minor)
    SUGGESTED_VERSION="$MAJOR.$((MINOR + 1)).0"
    TYPE_EMOJI="✨"
    TYPE_NAME="Minor"
    ;;
  patch)
    SUGGESTED_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
    TYPE_EMOJI="🐛"
    TYPE_NAME="Patch"
    ;;
esac

# 版本号检查
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📦 版本信息:${NC}"
echo -e "  Master 版本: ${CYAN}$MASTER_VERSION${NC}"
echo -e "  当前版本:   ${CYAN}$CURRENT_VERSION${NC}"

if [[ "$CURRENT_VERSION" != "$MASTER_VERSION" ]]; then
  echo -e "  ${GREEN}✓ 版本已更新${NC}"
  VERSION_UPDATED=true
else
  echo -e "  ${YELLOW}⚠️  版本未更新${NC}"
  VERSION_UPDATED=false
fi

echo ""
echo -e "${BLUE}🎯 建议版本:${NC}"
echo -e "  类型: $TYPE_EMOJI ${GREEN}$TYPE_NAME${NC} ($TYPE_REASON)"
echo -e "  版本: ${GREEN}$SUGGESTED_VERSION${NC}"
echo ""

# 如果版本未更新，询问是否更新
if [[ "$VERSION_UPDATED" == "false" ]]; then
  echo -e "${YELLOW}是否更新版本号？${NC}"
  echo -e "  ${GREEN}y${NC} - 使用建议版本 ($SUGGESTED_VERSION)"
  echo -e "  ${BLUE}c${NC} - 自定义版本号"
  echo -e "  ${YELLOW}n${NC} - 跳过（稍后更新）"
  echo ""
  read -p "请选择 (y/c/n，默认y): " update_choice
  
  case ${update_choice:-y} in
    y|Y)
      echo -e "${GREEN}正在更新版本...${NC}"
      case $SUGGESTED_TYPE in
        major) npm run version:major --silent ;;
        minor) npm run version:minor --silent ;;
        patch) npm run version:patch --silent ;;
      esac
      CURRENT_VERSION=$SUGGESTED_VERSION
      echo -e "${GREEN}✓ 版本已更新到 $CURRENT_VERSION${NC}"
      ;;
    c|C)
      read -p "请输入版本号: " CUSTOM_VERSION
      if [[ -n "$CUSTOM_VERSION" ]]; then
        sed -i.bak "s/\"version\": \".*\"/\"version\": \"$CUSTOM_VERSION\"/" package.json && rm package.json.bak
        git add package.json
        git commit -m "chore: 发布 v$CUSTOM_VERSION" --no-verify
        CURRENT_VERSION=$CUSTOM_VERSION
        echo -e "${GREEN}✓ 版本已更新到 $CUSTOM_VERSION${NC}"
      fi
      ;;
    *)
      echo -e "${YELLOW}跳过版本更新${NC}"
      ;;
  esac
  echo ""
fi

# 推送分支
echo -e "${BLUE}📤 推送分支...${NC}"
git push origin $CURRENT_BRANCH

# 生成 PR 标题
FIRST_COMMIT=$(git log origin/master..HEAD --pretty=format:"%s" | tail -1)
PR_TITLE="$FIRST_COMMIT"

# 如果只有一个提交，使用提交信息；否则使用分支名
if [[ $COMMIT_COUNT -gt 1 ]]; then
  # 根据分支名生成标题
  BRANCH_TYPE=$(echo "$CURRENT_BRANCH" | cut -d'/' -f1)
  BRANCH_DESC=$(echo "$CURRENT_BRANCH" | cut -d'/' -f2- | tr '-' ' ')
  case $BRANCH_TYPE in
    feature) PR_TITLE="feat: $BRANCH_DESC" ;;
    fix) PR_TITLE="fix: $BRANCH_DESC" ;;
    refactor) PR_TITLE="refactor: $BRANCH_DESC" ;;
    *) PR_TITLE="$BRANCH_DESC" ;;
  esac
fi

echo -e "${BLUE}📄 PR 标题:${NC} $PR_TITLE"
echo ""

read -p "使用此标题创建 PR？(Y/n): " confirm
if [[ ${confirm:-Y} =~ ^[Nn]$ ]]; then
  read -p "请输入 PR 标题: " CUSTOM_TITLE
  if [[ -n "$CUSTOM_TITLE" ]]; then
    PR_TITLE="$CUSTOM_TITLE"
  fi
fi

# 创建 PR
echo ""
echo -e "${GREEN}🚀 创建 PR...${NC}"

gh pr create \
  --title "$PR_TITLE" \
  --body "## 📝 变更内容

$COMMITS

## 📦 版本信息
- 更新版本: $MASTER_VERSION → $CURRENT_VERSION
- 提交数量: $COMMIT_COUNT

---
*此 PR 由智能创建脚本生成*" \
  --label "$(echo $SUGGESTED_TYPE | sed 's/patch/fix/; s/minor/feature/; s/major/breaking/')"

echo ""
echo -e "${GREEN}✓ PR 创建成功！${NC}"
echo ""
echo -e "${CYAN}下一步:${NC}"
echo -e "  1. 查看 PR: ${BLUE}gh pr view --web${NC}"
echo -e "  2. 等待 CI 检查通过"
echo -e "  3. 请求 review 或直接合并"

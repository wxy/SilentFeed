#!/usr/bin/env bash
set -euo pipefail

# PR Creator: Create or update a pull request with AI-generated decisions
# Dependencies: git, gh
# 
# This is the main entry point. AI should call this with all decisions pre-made.
#
# Required environment variables (from AI):
#   PR_BRANCH          - Branch name to work with
#   PR_TITLE_AI        - AI-generated PR title (respects PR_LANG)
#   PR_BODY_AI         - AI-generated PR body (can be inline or file path)
#   VERSION_BUMP_AI    - AI's version decision (major/minor/patch/skip)
#   CURRENT_VERSION    - Current version from analysis
#   NEW_VERSION        - Target version (AI should calculate this)
#   VERSION_FILE       - Which file contains version (manifest.json, package.json, etc.)
#
# Optional environment variables:
#   PR_LANG            - Language for PR (e.g., zh-CN, en; defaults to en)
#   DRY_RUN            - Set to "true" to preview changes without executing (test mode)
#
# For long descriptions, there are 3 reliable methods:
#   Method 1 (Recommended): Write to .github/pr-description.tmp file
#   Method 2 (Simple): Pass via PR_BODY_AI environment variable (short content only)
#   Method 3 (Flexible): Pipe via stdin: echo "..." | bash create-pr.sh
#
# Method 1 Example (most reliable for large/complex content):
#   printf '%s\n' "Line 1" "Line 2" > .github/pr-description.tmp
#   PR_BRANCH="..." PR_TITLE_AI="..." bash create-pr.sh
#
# Method 2 Example (for short descriptions):
#   PR_BODY_AI="Brief description" PR_BRANCH="..." bash create-pr.sh
#
# Method 3 Example (flexible, avoids shell escaping issues):
#   echo "Description from script" | \
#   PR_BRANCH="..." PR_TITLE_AI="..." bash create-pr.sh

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "[INFO] %s\n" "$1"; }
warn() { printf "[WARN] %s\n" "$1"; }
err()  { printf "[ERROR] %s\n" "$1"; }

current_branch() { git rev-parse --abbrev-ref HEAD; }

check_existing_pr() {
  local branch="$1"
  gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null || echo ""
}

apply_version_bump() {
  local from="$1" to="$2" file="$3"
  
  if [[ ! -f "$file" ]]; then
    warn "Version file $file not found; skipping version update"
    return 1
  fi
  
  case "$file" in
    manifest.json|package.json)
      sed -i.bak "s/\"version\"[[:space:]]*:[[:space:]]*\"${from}\"/\"version\": \"${to}\"/" "$file"
      ;;
    pyproject.toml)
      sed -i.bak "s/^version = \"${from}\"/version = \"${to}\"/" "$file"
      ;;
    setup.py)
      sed -i.bak "s/version='${from}'/version='${to}'/" "$file"
      sed -i.bak "s/version=\"${from}\"/version=\"${to}\"/" "$file"
      ;;
    *)
      err "Unknown version file format: $file"
      return 1
      ;;
  esac
  
  rm -f "${file}.bak"
  git add "$file"
  return 0
}

# === INPUT VALIDATION ===
bold "PR Creator - Apply Phase"

# Check required environment variables
for var in PR_TITLE_AI VERSION_BUMP_AI PR_BRANCH; do
  if [[ -z "${!var:-}" ]]; then
    err "Missing required variable: $var"
    exit 1
  fi
done

PR_TITLE="${PR_TITLE_AI}"
FINAL_LEVEL="${VERSION_BUMP_AI}"
WORKING_BRANCH="${PR_BRANCH}"

# Load PR description from multiple sources (in priority order)
if [[ -f .github/PR_DESCRIPTION.local.md ]]; then
  # Method 1: Read from local description file (preferred)
  info "Loading PR description from .github/PR_DESCRIPTION.local.md"
  PR_BODY="$(cat .github/PR_DESCRIPTION.local.md)" || {
    err "Failed to read .github/PR_DESCRIPTION.local.md"
    exit 1
  }
elif [[ -f .github/pr-description.tmp ]]; then
  # Method 2: Read from temporary file (backward compatible)
  info "Loading PR description from .github/pr-description.tmp"
  PR_BODY="$(cat .github/pr-description.tmp)" || {
    err "Failed to read .github/pr-description.tmp"
    exit 1
  }
elif [[ -n "${PR_BODY_AI:-}" ]]; then
  # Method 3: Use environment variable (for short descriptions)
  info "Using PR description from PR_BODY_AI environment variable"
  PR_BODY="${PR_BODY_AI}"
else
  # Method 4: Try to read from stdin (if piped)
  if [[ ! -t 0 ]]; then
    info "Reading PR description from stdin"
    PR_BODY="$(cat)" || {
      err "Failed to read from stdin"
      exit 1
    }
  else
    err "Missing PR description: use one of:"
    err "  1. Create .github/PR_DESCRIPTION.local.md file"
    err "  2. Create .github/pr-description.tmp file"
    err "  3. Set PR_BODY_AI environment variable"
    err "  4. Pipe description via stdin"
    exit 1
  fi
fi

# Optional variables with defaults
CURRENT_VER="${CURRENT_VERSION:-}"
NEW_VER="${NEW_VERSION:-}"
VERSION_FILE="${VERSION_FILE:-}"
PR_LANG="${PR_LANG:-en}"
DRY_RUN="${DRY_RUN:-false}"

# Add attribution footer to PR body (avoid duplicate signatures)
if ! echo "${PR_BODY}" | grep -qi "pr-creator"; then
  PR_BODY="${PR_BODY}

---
*此 PR 由 [pr-creator](https://github.com/wxy/pr-creator) 技能自动生成*"
fi

info "PR Title: ${PR_TITLE}"
info "Branch: ${WORKING_BRANCH}"
info "Language: ${PR_LANG}"
[[ -n "${CURRENT_VER}" ]] && info "Version: ${CURRENT_VER} → ${NEW_VER}"
info "Bump level: ${FINAL_LEVEL}"

# Dry run mode
if [[ "${DRY_RUN}" == "true" ]]; then
  bold "🧪 DRY RUN MODE - No changes will be made"
  echo ""
  echo "Would execute the following:"
  echo "  1. Checkout branch: ${WORKING_BRANCH}"
  if [[ "${FINAL_LEVEL}" != "skip" ]] && [[ -n "${CURRENT_VER}" ]] && [[ -n "${NEW_VER}" ]]; then
    echo "  2. Update version: ${CURRENT_VER} → ${NEW_VER} in ${VERSION_FILE}"
    echo "  3. Commit: chore: version bump ${CURRENT_VER} → ${NEW_VER}"
    echo "  4. Push changes"
  else
    echo "  2. Skip version update"
  fi
  echo "  5. Create/update PR with title: ${PR_TITLE}"
  echo "  6. PR body preview:"
  echo "     ----------------------------------------"
  echo "${PR_BODY}" | head -20
  echo "     ----------------------------------------"
  echo ""
  info "Dry run complete. Set DRY_RUN=false or unset to execute."
  exit 0
fi

# === CHANGE TO BRANCH ===
git checkout "${WORKING_BRANCH}" 2>/dev/null || {
  err "Failed to checkout branch: ${WORKING_BRANCH}"
  exit 1
}

# === VERSION UPDATE ===
if [[ "${FINAL_LEVEL}" != "skip" ]] && [[ -n "${CURRENT_VER}" ]] && [[ -n "${NEW_VER}" ]] && [[ -n "${VERSION_FILE}" ]]; then
  bold "Updating version (${CURRENT_VER} → ${NEW_VER})"
  if apply_version_bump "${CURRENT_VER}" "${NEW_VER}" "${VERSION_FILE}"; then
    git commit -m "chore: version bump ${CURRENT_VER} → ${NEW_VER}" || info "No version changes to commit"
    git push origin "$(current_branch)" || true
    info "Version updated and pushed"
  else
    warn "Version update failed; continuing with PR creation"
  fi
else
  if [[ "${FINAL_LEVEL}" == "skip" ]]; then
    info "Skipping version update (as requested)"
  else
    info "Missing version info; skipping version update"
  fi
fi

# === CREATE/UPDATE PR ===
bold "Creating/updating PR"

# Check for existing PR
CBR="$(current_branch)"
EXISTING_PR="$(check_existing_pr "${CBR}")"

if [[ -n "${EXISTING_PR}" ]]; then
  bold "Updating PR #${EXISTING_PR}..."
  gh pr edit "${EXISTING_PR}" --title "${PR_TITLE}" --body "${PR_BODY}" || {
    err "Failed to update PR"
    exit 1
  }
  info "PR #${EXISTING_PR} updated successfully"
else
  bold "Creating new PR..."
  gh pr create --title "${PR_TITLE}" --body "${PR_BODY}" --base master || {
    err "Failed to create PR"
    exit 1
  }
  info "PR created successfully"
fi

# Cleanup temporary files
rm -f .github/pr-description.tmp

info "Done!"

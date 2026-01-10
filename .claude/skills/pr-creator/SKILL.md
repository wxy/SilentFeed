---
name: pr-creator
description: A minimal, dependency-light skill to create PRs with semantic versioning support, structured descriptions, and automatic branch renaming.
---

# PR Creator Skill

This skill automates PR creation with AI-guided semantic versioning and branch renaming.

## Installation

### Using OpenSkills (Remote Install)

```bash
# Install latest skill from remote repository
openskills install wxy/pr-creator -y

# Sync to AGENTS.md for conversation usage
openskills sync -y
```

### Manual Installation

Clone this repository to your local skills directory or use the script directly.

## Usage

### With OpenSkills (Recommended)

```bash
# Use the skill in your project
openskills use pr-creator "Create a PR"

# Or trigger with specific commands
openskills use pr-creator "Suggest version bump"
openskills use pr-creator "Update version and open PR"
```

### Direct Script Execution

```bash
bash path/to/scripts/create-pr.sh
```

## Triggers
- "Create a PR"
- "Suggest version bump"
- "Update version and open PR"

## Capabilities
- Analyze commits and detect change types (BREAKING/`!`, `feat`, `fix`, `refactor`, etc.)
- Suggest a semantic version bump: major > minor > patch
- Prompt the user to accept/adjust/skip the bump
- Update `manifest.json` version (if present)
- **Detect user's conversation language** and use appropriate PR template
- Generate a structured PR description (see `.github/pull_request_template.md` or `pull_request_template_zh.md`)
- **Check for existing PR** on current branch and update instead of creating new one
- Rename current branch to match the PR title (optional)
- Create or update PR via `gh`

## Workflow
1. **Check for existing PR**:
```bash
gh pr list --head $(git branch --show-current)
```
   - If PR exists → update mode (edit PR description)
   - If no PR exists → create mode

2. **Detect user's language**:
   - Analyze recent conversation messages
   - Chinese/中文 → use `references/pull_request_template_zh.md`
   - English/default → use `references/pull_request_template.md`

3. Gather changes:
```bash
git log origin/master..HEAD --format="%h %s"
git diff --stat origin/master..HEAD
```

4. Decide bump:
- BREAKING or `!` in commits → major
- Any `feat:` → minor
- Otherwise → patch

5. Confirm with user:
- Accept suggestion
- Try alternative level
- Skip bump

6. Apply bump (if confirmed):
- Update `manifest.json` version via sed
- Create commit and push

7. Generate PR description:
 - Use language-appropriate template from `references/pull_request_template.md` or `references/pull_request_template_zh.md`
 - Generate temporary file at `.github/.pr_description_tmp.md` (not committed to git)
 - Include version bump details and key changes

## Installation & Version Control Notes

- Installed skills are placed under `.claude/skills/` and are installation artifacts; do not commit them to git. The repository includes `.gitignore` rules to exclude `.claude/`.
- Universal installs (shared across projects) use `.agent/skills/`. These are also installation artifacts and excluded from version control.
- The source of truth is the remote repository `wxy/pr-creator`. Re-run `openskills install wxy/pr-creator -y` and `openskills sync -y` after updates to stay current.

8. Rename branch (optional):
- Derive slug from PR title
- `git branch -m <new>` and `git push --set-upstream origin <new>`

9. Create or update PR via `gh`:
   - **Create**: `gh pr create --title "..." --body-file .github/.pr_description_tmp.md`
   - **Update**: `gh pr edit <number> --body-file .github/.pr_description_tmp.md`
   - Temporary file is cleaned up after PR creation/update

## Minimal Script
See `scripts/create-pr.sh` for an implementation using POSIX shell and `gh`.

## Future Enhancements
- Add support for more project files (package.json, pyproject.toml)
- CI hooks to validate version bump after PR creation

## License
MIT

# How to Revert to a Tagged Commit

## List All Tags

```bash
# List tags sorted by version (newest first)
git tag --list --sort=-v:refname

# List tags with their commit messages
git tag -n

# List tags with full annotation details
git tag -l -n99

# Show which commit a tag points to
git rev-list -n 1 v1.0.0
```

## Review a Tag Before Reverting

```bash
# View tag details (author, date, message, commit)
git show v1.0.0

# See what changed between current HEAD and the tag
git diff v1.0.0

# See commit log between the tag and current HEAD
git log v1.0.0..HEAD --oneline

# Browse files at the tagged commit without switching
git show v1.0.0:path/to/file
```

## Revert Strategies

### Option 1: Create a New Branch from the Tag (Safest)

Creates a new branch starting from the tagged commit. No existing branches are affected.

```bash
# Create and switch to a new branch from the tag
git checkout -b recovery-v1.0.0 v1.0.0

# Push the recovery branch
git push origin recovery-v1.0.0
```

### Option 2: Reset a Branch to the Tag (Destructive)

Moves an existing branch pointer back to the tagged commit. **This discards all commits after the tag.**

```bash
# Make sure you're on the branch you want to reset
git checkout uat

# Hard reset to the tagged commit (destroys uncommitted work)
git reset --hard v1.0.0

# Force push to update remote (required after reset)
git push origin uat --force
```

> **Warning:** Force pushing rewrites remote history. Coordinate with your team before doing this. Anyone who has pulled commits after the tag will need to reset their local branch.

### Option 3: Revert All Commits Since the Tag (Non-Destructive)

Creates new commits that undo changes, preserving full history. Best for shared branches.

```bash
# Find all commits between the tag and HEAD
git log v1.0.0..HEAD --oneline

# Revert them in reverse order (newest first)
# The .. range gives you the commit hashes to revert
git revert --no-commit HEAD~3..HEAD   # adjust range as needed
git commit -m "revert: roll back to v1.0.0 state"

# Push normally (no force needed)
git push origin uat
```

## After Reverting: Verify Deployment

```bash
# Watch GitHub Actions
gh run watch

# Verify ArgoCD picks up the change
kubectl --context admin@macmini-cluster get applications -n argocd -w
```

## Quick Reference

| Goal | Command |
|------|---------|
| List tags | `git tag --list --sort=-v:refname` |
| Inspect a tag | `git show v1.0.0` |
| Diff against tag | `git diff v1.0.0` |
| New branch from tag | `git checkout -b recovery v1.0.0` |
| Hard reset to tag | `git reset --hard v1.0.0` |
| Revert to tag (safe) | `git revert --no-commit v1.0.0..HEAD` |

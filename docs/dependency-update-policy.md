# Dependency update policy

Wait 7 days before merging a version bump.

`.github/dependabot.yml` sets `cooldown.default-days` to 7, so Dependabot does not open a version-update pull request until the release is 7 days old. Security updates are not held by that cooldown. A weekly schedule is not permission to merge a version on the day it was published.

vitest and `@vitest/coverage-v8` update in one group. Dependabot does not open pull requests for `@deepseek-ai/*`, and it ignores major bumps of `@types/node`.

`renovate.json` sets `minimumReleaseAge` to `7 days`, but nothing in this repo runs Renovate. The wait that the bot enforces is the Dependabot cooldown above.

Do not merge a version bump the day it is published, even when CI is green. A lockfile change that only repeats a version which is already 7 days old can merge with the bump it belongs to. It does not skip the wait, and it does not start a new one.

This policy does not point at a Dependabot pull request. Open one only when the bot actually does.

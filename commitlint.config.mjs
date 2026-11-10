// Commit message rules - Conventional Commits, enforced by the commit-msg hook and CI.
// Docs: https://www.conventionalcommits.org/
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Keep the type list trimmed to what this project actually uses.
    "type-enum": [
      2,
      "always",
      [
        "feat", // new feature
        "fix", // bug fix
        "docs", // documentation only
        "style", // formatting, no code change
        "refactor", // neither fixes a bug nor adds a feature
        "perf", // performance improvement
        "test", // adding or fixing tests
        "build", // build system or dependencies
        "ci", // CI configuration
        "chore", // other changes that don't modify src or test
        "revert", // revert a previous commit
      ],
    ],
    // Chinese subjects have no "case", so don't enforce one.
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    // Long bodies (stack traces, tables) are fine.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};

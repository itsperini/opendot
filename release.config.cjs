const releaseRules = [
  { breaking: true, release: "major" },
  { type: "feat", release: "minor" },
  { type: "fix", release: "patch" },
  { type: "perf", release: "patch" },
  { type: "revert", release: "patch" },
  { type: "build", release: false },
  { type: "chore", release: false },
  { type: "ci", release: false },
  { type: "docs", release: false },
  { type: "refactor", release: false },
  { type: "style", release: false },
  { type: "test", release: false },
];

module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules,
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/github",
      {
        failCommentCondition: false,
        labels: false,
        releasedLabels: false,
        successCommentCondition: false,
      },
    ],
  ],
};

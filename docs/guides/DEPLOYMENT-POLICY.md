# Explicit production deployments

The owner requires production releases to be explicit to control build costs.
Merging a PR does not request a production deployment.

`vercel.json` sets `git.deploymentEnabled` to `false`, disabling automatic Git
builds for all branches. Vercel documents this setting at
<https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments>.

Keep normal repository checks and local integration validation. An absent
optional Vercel deployment status is not a failed integration check. Existing
failing checks and required branch protections still apply.

When a production release is explicitly requested, use the production flag
(`vercel --prod`) from the reviewed release checkout, or the equivalent explicit
production target in the deployment API. Verify the deployed revision and the
production result before recording it as deployed. Do not deploy shared,
uncommitted agent work. Preview deployments and per-commit production builds
are not substitutes for local UI checks.

The Vercel project ignore rule that skips previews but allows production does
not itself disable automatic production builds from Git. Keep the repository
Git deployment setting in place. Do not change deployment protection, secrets,
workflow permissions, or required checks to make a release pass.

For task updates, distinguish merged and locally validated work from a
production-verified release. Record deployment-dependent acceptance criteria as
pending until the explicit release has been verified.

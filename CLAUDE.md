# Working on LEX

Read `README.md` and `docs/INTEGRATION_HANDOFF.md` before changing integrations.
The task prompt is in `docs/CLAUDE_INTEGRATION_PROMPT.md`.

- This is buildless static HTML/CSS/JavaScript with local directory routes.
- Preserve the approved LEX design: real-husky personality, cream, dark navy,
  Cronos blue, artwork, typography, header, footer and mobile navigation.
- `assets/site-ui.js` implements UI previews, not working wallet integrations.
- Public burn metrics/history already work. Keep their read-only behavior and
  honest loading/empty/error states.
- Existing $LEX staking, swap and NFT contract details are missing. Use the colleague's working
  implementation and verified configuration. Never guess deployment details.
- For the new LEX/WCRO LP farm, see `docs/LP_FARM.md`. Reuse its read/action
  adapter when adding the farm to another frontend. Publish the farm address
  only after confirming the deployment and approved campaign details.
- Integrating existing contracts does not authorize deploying, upgrading or
  modifying contracts, or moving real funds/NFTs during development tests.
- Keep HuskyWorld planned and the next roadmap phase subject to DAO approval.
- Do not reintroduce the removed archived project.

Use a shared wallet/provider state layer and separate domain integrations. Remove
overlapping preview listeners when wiring real actions. Keep unsupported actions
disabled until the full flow is implemented and checked. Avoid a framework rewrite
just for styling; explain tooling needed by the working integration. Update setup
and hosting documentation if it changes. Deliver a reviewable branch/PR with
meaningful checks and an explicit list of remaining verified inputs.

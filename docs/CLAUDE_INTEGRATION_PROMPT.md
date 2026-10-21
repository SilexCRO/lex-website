# Prompt for Claude

You are working in https://github.com/SilexCRO/lex-website. Start from branch
`codex/lex-v18-integration-handoff` (or main after its PR is merged), then create a
new integration branch. Do not use an older main checkout that still links
application pages elsewhere. Read `CLAUDE.md`, `README.md` and
`docs/INTEGRATION_HANDOFF.md` first. Then inspect the working staking, swap and
wallet implementation supplied by my colleague; use it and its verified
deployment configuration as the source of truth for functionality.

Integrate into our existing LEX design:

1. A shared Cronos wallet connection/state layer.
2. $LEX staking: actual balances/stakes/rewards and the supported approval,
   stake, unstake, claim and exit flows.
3. OG Pass NFT staking: actual owned/staked IDs and verified supported approval,
   deposit, withdrawal and reward-claim flows.
4. Buy/sell swap: real quotes/routes, precise units, approvals, fees, slippage,
   submissions and transaction states.
5. Other relevant existing functionality, including DAO proposals/snapshots/
   message signing only if its working backend/configuration is available.

Keep the cream/navy/Cronos-blue style, artwork, layouts, responsive navigation,
footer and local routes. Wire functionality inside the existing panels. The site
is static HTML/CSS/JS; choose the smallest maintainable integration approach and
explain any required tooling/hosting changes.

The LEX token is `0x25B7449E2416e0Ef0f244f6cC34eb31C4902d9Cb` on Cronos EVM,
chain ID 25. Pool/NFT/router/LP addresses, ABIs, fees and DAO APIs must be verified
from the supplied implementation. Never guess them. List missing inputs together
and continue independent work. Do not deploy, upgrade or change smart contracts.

Preserve public live burn tracking. Do not invent APRs, balances, rewards or
quotes. Keep unsupported actions disabled, removing preview labels only for
completed, tested flows. The token's 0% buy/sell tax differs from the old site's
separate 5% ecosystem-support fee: confirm the actual policy and transaction
sequence before wiring it. Keep HuskyWorld planned and the five-step next roadmap
phase subject to DAO approval.

Implement the integration, not just a plan. Check wrong networks, account changes,
rejected signatures, failed/reverted transactions, allowances, units/decimals,
quote expiry and mobile behavior using mocks/simulation or an approved test
setup. Do not move real funds/NFTs during development. Update documentation and
deliver a PR explaining what works, what was checked and what still needs
verified input from the team.

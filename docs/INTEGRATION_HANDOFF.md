# Wallet and application integration handoff

## Objective

Integrate the colleague's working staking and related wallet code into the
completed version-18 LEX website. Preserve its design and local routes.
This concerns frontend connections to existing verified deployments; writing,
deploying, upgrading or changing smart contracts is outside this task.

## Known configuration

| Item | Value |
| --- | --- |
| Network | Cronos EVM mainnet |
| Chain ID | 25 (`0x19`) |
| Native gas asset | CRO |
| LEX token | `0x25B7449E2416e0Ef0f244f6cC34eb31C4902d9Cb` |
| Token decimals | 18 in the guide/history; metrics also read decimals on-chain |
| Dead wallet | `0x000000000000000000000000000000000000dEaD` |
| Current public RPCs | `https://cronos-evm-rpc.publicnode.com`, `https://evm.cronos.com` |
| OG Pass marketplace | `https://app.ebisusbay.com/collection/cronos/lex-og-pass` |

The LEX address does not identify the staking pool, NFT collection contract, NFT
staking contract, swap router, LP pair or fee recipient. Get those addresses and
ABIs from the verified working implementation/owner. A marketplace URL is not a
contract address. No APR, reward rate, mint terms or router route is supplied here.

## Files and hooks

| Location | Current state | Required integration |
| --- | --- | --- |
| `swap/index.html` | Buy/sell UI, amount input, disabled CTA | Wallet, verified quote/route, allowance, trade, receipts/error states |
| `staking/index.html` | Stake/unstake tabs and empty metrics | Real pool reads and supported approval/stake/unstake/claim/exit actions |
| `staking/nft/index.html` | OG Pass empty-state preview | Actual owned/staked IDs and verified approval/deposit/withdraw/claim |
| `og-pass/index.html` | Collection information and marketplace | Only add verified existing utility; no invented mint or benefits |
| `dao/index.html` | Rules and link to existing voting | Inspect the existing snapshot/signature/proposal backend first |
| `how-to-buy/index.html` | Preview-aware buying guide | Update after the new swap is fully working |
| `assets/site-ui.js` | Copy-address and local preview listeners | Refactor overlapping listeners instead of adding a second state system |
| `assets/burn-stats.js` | Working read-only supply metrics | Preserve/reuse; wallet not needed |
| `assets/burn-history.js` | Working bounded recent log scan | Preserve, or use a verified indexer for full latest-five history |

Swap hooks: `#swap-amount`, `#pay-token`, `#receive-token`,
`[data-swap-mode="buy"]`, `[data-swap-mode="sell"]`, `[data-swap-reverse]`.
`.quote-value` is an em dash; `.inactive-button` is a disabled placeholder.

Staking hooks: `#stake-amount`, `#stake-label`, `[data-stake-tab="stake"]`,
`[data-stake-tab="unstake"]`. Personal metric dashes are placeholders. Add
deterministic IDs/data attributes for actual balances and actions as needed.

NFT staking: `.nft-empty` and a disabled CTA. There is no token-ID selection or
NFT deployment configuration in the current implementation.

Burn hooks: `#lex-total-supply`, `#lex-burned-supply`, `#lex-burn-percent`,
`#lex-burn-progress`, `#lex-burn-fill`, `#lex-stats-note`, `#lex-burn-txns`,
`#lex-tx-status`. Metrics read supply/balance/decimals from one endpoint and block.
History excludes the latest 12 blocks, scans 50,000 blocks, groups by transaction,
and shows at most five records. No result is an honest recent empty state, not
proof that there have never been burns. The explorer contains older history.

## Implementation order

1. Inspect this repository and the colleague's working code. Identify providers,
   deployment addresses, ABIs, routing, approval requirements, reward assets and
   DAO API. Ask for missing inputs in one batch and continue independent work.
2. Add one wallet/provider state layer. Clear stale personal data and invalidate
   quotes on account/chain changes or disconnect. Keep public reads independent.
3. Integrate token staking first using the actual existing pool implementation.
   Implement real reads and supported actions; do not infer methods from labels.
4. Integrate OG Pass staking with confirmed NFT/pool details and actual holdings.
5. Integrate swap using the working quote/router flow. Use exact integer/string
   units, not floating-point token arithmetic. Validate amount inputs; replacing
   `type="number"` with validated decimal text inputs may be appropriate.
6. Bring DAO voting here only if the working backend is supplied. Off-chain
   snapshots/message signing must not be replaced by an invented voting contract
   or hardcoded proposal totals.
7. Remove each preview/disabled state only when that particular flow is fully
   implemented and checked. Leave other planned features clearly planned.

Separate wallet and domain adapter modules are recommended, but their filenames
are not prescribed. Reuse proven code/dependencies. Do not add a large framework
just to restyle existing pages; explain build/hosting changes if the integration
requires them.

## Fees and transaction UX

- The token's reported buy/sell tax is 0%.
- The old website swap separately describes a 5% ecosystem-support fee. It is
  not a token tax or an implemented fee in this repository. Confirm its exact
  optional/mandatory behavior, basis, recipient and transaction sequence with the
  owner/working code before wiring it.
- Show the full quote and fee breakdown before asking the wallet to sign. Handle
  slippage, price impact, quote expiry and allowance requirements explicitly.
- Track approval, rejection, pending, replacement, confirmation and reverted
  states accurately. Avoid duplicate submissions or calling a quote a trade.
- Approval methods/scopes/spenders must follow the verified ABI and deployment,
  including NFT permissions. Do not derive them from the preview markup.
- Document public configuration. Never put private keys or service secrets in
  browser code/repository; never request a seed phrase.

## Preserve

- Approved cream/navy/Cronos-blue style, artwork, layouts, navigation and footer.
- Functional modules inside the existing panels, rather than a generic Web3 UI.
- The public burn tracker, address copying, internal routes and mobile behavior.
- HuskyWorld as planned, with no playable/downloadable build announced here.
- The five next roadmap steps as proposed and DAO-gated; no passed vote is given.
- Accurate content: no invented partners, APRs, balances, rewards, prices, NFT
  benefits, launch dates or addresses. Keep the removed archived project omitted.

## Acceptance checks

- Public views work without a wallet. Disconnected/wrong-network wallets cannot
  submit actions and receive an actionable state.
- Actual balances/stakes/rewards/NFT ownership refresh correctly when the account
  or network changes. Loading, empty, error and connected states are distinct.
- Every enabled action has a complete verified flow: exact amounts, approvals,
  transaction status, and explorer link when available.
- Test units/decimals, insufficient funds/gas, rejected requests, RPC failures,
  stale quotes, approval-then-action and reverts with meaningful mocks/simulation
  or an approved test setup. Do not move real funds/NFTs during development.
- Check routes, images and mobile layouts, especially repeated menu clicks.
- Document dependencies/setup/host changes and supply a reviewable PR explaining
  what works, what was checked and which verified inputs are still missing.

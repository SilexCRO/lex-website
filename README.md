# LEX The Husky website

The complete LEX website from preview version 18, published on 21 October 2026:
[live preview](https://lex-the-husky-preview.bloodybelgian.chatgpt.site/?rev=18).

This is static HTML, CSS and JavaScript. No package installation or build step is
required. Deploy the repository root on a static host with directory index pages.
Root-relative paths such as `/assets/site.css` assume hosting at the domain root.

## Pages

| Page | Route | Current behavior |
| --- | --- | --- |
| Home | `/` | Brand, ecosystem and live burn statistics/history |
| Ecosystem | `/ecosystem/` | Project overview and internal page links |
| Swap | `/swap/` | UI preview; wallet connection/trading disabled |
| How to buy | `/how-to-buy/` | Wallet/network guide and address copy |
| Token staking | `/staking/` | Stake/unstake preview; wallet actions disabled |
| OG Pass | `/og-pass/` | Collection information and official marketplace link |
| OG Pass staking | `/staking/nft/` | NFT staking preview; wallet actions disabled |
| OG Pass staking alias | `/og-pass-staking/` | Internal redirect to `/staking/nft/` |
| HuskyWorld | `/huskyworld/` | Planned concept; no playable/downloadable game |
| Burn Center | `/burn-center/` | Read-only Cronos metrics and recent transfers |
| DAO | `/dao/` | Rules/context; voting links to the existing DAO |
| Roadmap | `/roadmap/` | Existing ecosystem and five proposed, DAO-gated steps |
| Community | `/community/` | Official links and team/project information |
| Whitepaper | `/whitepaper/` | Key facts; PDF links to the official document |
| Privacy | `/privacy-policy/` | Basic privacy policy |
| Terms | `/terms-of-service/` | Basic terms of service |

## Integration handoff

Read [CLAUDE.md](CLAUDE.md), then [the technical handoff](docs/INTEGRATION_HANDOFF.md).
The [ready-to-use Claude prompt](docs/CLAUDE_INTEGRATION_PROMPT.md) explains the task.

Staking/NFT pool addresses, swap routing, ABIs and wallet wiring are **not included**.
Use the colleague's working integration and verified deployment configuration.
The previews are not completed contract integrations.

## Preview locally

Serve this directory with a static web server, for example:

```sh
python -m http.server 8080
```

Open `http://localhost:8080`. Opening HTML directly from disk is not representative
because the site uses root-relative URLs.

## Files and data

- `assets/site.css`: shared brand, navigation, footer and retained page styles.
- `assets/pages.css`: swap, guide, staking, OG Pass, HuskyWorld and burn layouts.
- `assets/site-ui.js`: local preview interactions only; no wallet calls.
- `assets/burn-stats.js`: read-only supply/dead-wallet metrics every 60 seconds.
- `assets/burn-history.js`: up to five transfers from the latest 50,000 confirmed
  blocks, checked every five minutes. This is a bounded recent scan, not an
  all-time index. The explorer provides older history.
- Images are local; WebP copies are used for the new OG Pass and HuskyWorld art.
- Google Fonts and public Cronos RPC endpoints are external dependencies.

No secrets, contract source/deployments, Sites credentials/hosting identity or
duplicate `dist/` output are included.

## Source and validation

Website files match Sites source commit
`bd14d00f62a33571008b8e860d89b83c3d3d5693`, published as preview version 18.
This GitHub export adds the integration documentation.

The preview was checked on desktop and at 390px mobile width: migrated routes,
internal links, images, menu stability, UI tabs and live burn metrics. JavaScript
syntax checks passed. Transaction signing/staking was not tested because wallet
integrations are not present. The removed archived project remains omitted.

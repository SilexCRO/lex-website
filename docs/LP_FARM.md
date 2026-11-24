# LEX/WCRO LP farm

This is a single, prefunded $LEX campaign for the existing Obsidian LEX/WCRO pool
on Cronos. It follows the [EMBER Inferno campaign](https://embercro.com/inferno):
stake LP, accrue a proportional share of rewards each second, withdraw at any
time, and claim during or after the campaign.

## Contracts and campaign terms

| Item | Verified identity or required input |
| --- | --- |
| Network | Cronos EVM mainnet, chain ID 25, native CRO for gas |
| Reward token | `0x25B7449E2416e0Ef0f244f6cC34eb31C4902d9Cb` ($LEX, 18 decimals) |
| WCRO | `0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23` |
| Obsidian LP token | `0x6168431f133525be550cB03D4fEfc06e955f4997` (OBSIDIAN-LP, 18 decimals) |
| [Obsidian factory](https://wiki.obsidian.finance/dex/contracts) | `0xCd2E5cC83681d62BEb066Ad0a2ec94Bf301570C9` |
| Decisions after DAO approval | Reward budget in $LEX, campaign duration, funding wallet or multisig |
| Farm address | Set in `assets/lp-farm-config.js` after deployment and verification |

The deployment script checks the factory’s registered pair, token addresses,
decimals and liquidity directly on Cronos. Confirm the LP choice with the team.
VVS and Obsidian issue separate LP tokens for the same underlying assets.

The funding wallet approves the exact budget and calls `start()`. The contract
pulls the full budget and starts the clock in the same transaction. Budget,
duration, funding wallet and token addresses are immutable. The farm has a
single campaign with no lock period, farm fee, auto-renewal, upgrade, or admin
withdrawal. Gas fees apply.

Rewards start accruing for a wallet after it deposits. A regular withdrawal
returns LP and retains its earned $LEX. An emergency withdrawal returns all LP
and forfeits the wallet’s unclaimed rewards. Emissions from empty periods,
forfeited rewards, and rounding dust remain in the contract permanently, as
with the Inferno model. Direct token transfers to the farm are unrecoverable.
Users should deposit through `stake()` after approving LP.

## Build and rehearse

Install [Foundry](https://getfoundry.sh/introduction/installation/) and Node.js,
then run from the repository:

```sh
cd contracts
npm ci --ignore-scripts
forge test
```

Compiler settings are pinned in `contracts/foundry.toml`. Tests cover exact
funding, reward shares and rounding, positions after campaign end, principal
recovery, emergency forfeiture, and fuzzed reward/principal conservation.

Set these public environment variables to the approved values in your shell:

- `LEX_FARM_FUNDER` is the address that will send the funding transactions.
- `LEX_FARM_BUDGET_WEI` is the approved amount of $LEX in 18-decimal base units.
  Use `cast to-wei "$LEX_AMOUNT"` for an exact decimal conversion.
- `LEX_FARM_DURATION_SECONDS` is the approved duration in whole seconds.
- `DEPLOYER_ADDRESS` is the address that will create the contract and pay its gas.

Rehearse the deployment against a fork before using the campaign funds:

```sh
forge script script/DeployLexLpFarm.s.sol:DeployLexLpFarm \
  --rpc-url https://evm.cronos.com --sender "$DEPLOYER_ADDRESS"
```

This command simulates the deployment. Use test values and local test tokens
for the full approve, fund, stake, withdraw and claim rehearsal. Have the
immutable settings and contract reviewed before using treasury funds.

## Launch the approved campaign

1. Deploy with the reviewed parameters on Cronos. Foundry can sign with a
   hardware wallet using the same command with `--ledger --broadcast` when
   the connected Ledger matches the approved deployer. Keep signer secrets
   outside this repository.
2. Verify the deployed source and constructor arguments in
   [Cronos Explorer](https://explorer.cronos.com/verifyContract). Check
   `stakingToken()`, `rewardToken()`, `fundingAccount()`,
   `rewardBudget()` and `duration()` on the deployed contract. Record the
   creation transaction and deployment address. At this stage `startTime()`
   should return zero.
3. From the approved funding wallet, sign the following transactions in order.
   A multisig can prepare them as an atomic batch. Here `$FARM` is the
   verified farm address.

   | Transaction target | Method | Arguments |
   | --- | --- | --- |
   | $LEX token | `approve(address,uint256)` | `$FARM`, `$LEX_FARM_BUDGET_WEI` |
   | `$FARM` | `start()` | None |

   To prepare calldata, use `cast calldata 'approve(address,uint256)' "$FARM"
   "$LEX_FARM_BUDGET_WEI"` and `cast calldata 'start()'`. Both send zero native
   CRO as value. Confirm `CampaignStarted`, start/end, and the farm’s actual
   $LEX balance on chain. Publish the reward schedule with the farm address.
4. Put the verified address in `assets/lp-farm-config.js` and ship the website.
   Open `/lp-farm/` and check the public campaign and wallet state. Update the
   ecosystem’s planned status when deposits are open.

## Frontend integration

The website is buildless and uses a browser wallet that implements EIP-1193.
The page reads the campaign, total stake, reward token balance and personal
position from Cronos. It enables deposits during the funded campaign and keeps
withdrawal and claim available for existing positions after the end.

Use `forge inspect LexLpFarm abi` for another frontend, or reuse
`assets/lp-farm-client.js` with the deployment configuration. For an Ember
interface, register the same verified farm address with the same LP/reward
tokens. Keep LP approval and staking as separate user-confirmed calls, reset
personal balances on account/network change, and check transaction receipts
before reporting success.

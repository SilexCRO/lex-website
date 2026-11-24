import { deployment } from './lp-farm-config.js';
import { createFarmClient, formatUnits, isAddress, isHash, parseLp } from './lp-farm-client.js';

const byId = id => document.getElementById(id);
const configured = isAddress(deployment.farmAddress);
const wallet = window.ethereum;
const client = createFarmClient(deployment);
const walletButton = byId('farm-wallet-button');
const input = byId('farm-amount');
const maxButton = byId('farm-max');
const status = byId('farm-status');
const txNote = byId('farm-tx-note');
const txLink = byId('farm-tx-link');
const modeButtons = [...document.querySelectorAll('[data-farm-mode]')];
const actionButtons = [...document.querySelectorAll('[data-farm-action]')];

let mode = 'stake';
let walletRevision = 0;
let dataRevision = 0;
let account = null;
let onExpectedChain = false;
let campaign = null;
let position = null;
let walletBusy = false;
let sending = false;
let refreshing = configured;
let positionUnavailable = false;

const states = {
  planned: ['Awaiting launch', 'The farm address and campaign terms will be published after DAO approval.'],
  loading: ['Checking Cronos', 'Reading the farm contract and reward schedule.'],
  unavailable: ['Data unavailable', 'The farm could not be verified on Cronos. Check back shortly.'],
  unfunded: ['Awaiting funding', 'Deposits open when the treasury funds and starts the campaign.'],
  active: ['Deposits open', 'Rewards accrue each second based on your share of the LP staked.'],
  ended: ['Campaign ended', 'You can still withdraw LP and claim your earned $LEX.'],
};

const actionLabels = {
  approve: ['Approve the exact LP amount in your wallet.', 'LP approval confirmed. You can now stake.'],
  stake: ['Confirm your LP deposit in your wallet.', 'LP deposit confirmed.'],
  withdraw: ['Confirm your LP withdrawal in your wallet.', 'LP withdrawal confirmed.'],
  claim: ['Confirm your $LEX claim in your wallet.', '$LEX claim confirmed.'],
  exit: ['Confirm your full withdrawal and claim in your wallet.', 'LP withdrawn and any earned $LEX claimed.'],
  emergencyWithdraw: ['Confirm your emergency withdrawal in your wallet.', 'LP withdrawn. Unclaimed rewards were forfeited.'],
};

function putText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function metric(id, value, symbol) {
  const element = byId(id);
  putText(element, value === undefined ? '—' : formatUnits(value, 6) + ' ' + symbol);
  element.title = value === undefined ? '' : formatUnits(value) + ' ' + symbol;
}

const dateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
});

function utc(seconds) {
  if (!seconds) return '—';
  const date = new Date(Number(seconds) * 1000);
  return Number.isNaN(date.valueOf()) ? '—' : dateFormat.format(date) + ' UTC';
}

function amountLimit() {
  if (!position) return 0n;
  if (mode === 'withdraw') return position.staked;
  return campaign?.state === 'active' ? position.available : 0n;
}

function actionAllowed(action, amount) {
  if (!campaign || !account || !onExpectedChain || !position || walletBusy || sending) return false;
  if (action === 'claim') return position.earned > 0n;
  if (action === 'exit' || action === 'emergencyWithdraw') return position.staked > 0n;
  if (amount === null || amount > amountLimit()) return false;
  if (action === 'withdraw') return mode === 'withdraw';
  if (mode !== 'stake') return false;
  return action === 'approve' ? position.allowance < amount : position.allowance >= amount;
}

function render() {
  const state = campaign?.state ?? (!configured ? 'planned' : refreshing ? 'loading' : 'unavailable');
  status.dataset.state = state;
  putText(status, states[state][0]);
  putText(byId('farm-status-note'), states[state][1]);
  metric('farm-total', campaign?.staked, 'LP');
  metric('farm-budget', campaign?.allocation, 'LEX');
  metric('farm-remaining', campaign?.remaining, 'LEX');
  metric('farm-reward-balance', campaign?.balance, 'LEX');
  putText(byId('farm-start'), utc(campaign?.starts));
  putText(byId('farm-end'), utc(campaign?.ends));

  metric('farm-available', position?.available, 'LP');
  metric('farm-staked', position?.staked, 'LP');
  metric('farm-earned', position?.earned, 'LEX');

  const walletStatus = byId('farm-wallet-state');
  const walletHint = !configured ? 'Wallet access opens when the farm address is published.'
    : !campaign ? states[state][1]
    : !wallet ? 'Open this page in a wallet browser or enable a browser wallet.'
    : !account ? 'Connect your wallet to see your LP and earned $LEX.'
    : !onExpectedChain ? 'Switch your wallet to Cronos Mainnet to continue.'
    : positionUnavailable ? 'Could not load your LP balances. Retrying shortly.'
    : account.slice(0, 6) + '…' + account.slice(-4) + ' on Cronos';
  putText(walletStatus, walletHint);
  walletStatus.title = account ?? '';
  putText(walletButton, account ? (onExpectedChain ? 'Connected' : 'Switch to Cronos') : 'Connect wallet');
  walletButton.disabled = !campaign || !wallet || walletBusy || sending || Boolean(account && onExpectedChain);

  const limit = amountLimit();
  input.disabled = !limit || sending || walletBusy;
  maxButton.disabled = input.disabled;
  const amount = parseLp(input.value);
  const hint = !input.value ? ''
    : amount === null ? 'Enter a positive LP amount with up to 18 decimal places.'
    : amount > limit && !input.disabled ? 'Amount exceeds your available LP.'
    : '';
  putText(byId('farm-amount-note'), hint);
  for (const button of actionButtons) {
    const action = button.dataset.farmAction;
    button.disabled = !actionAllowed(action, amount);
    if (action === 'approve' || action === 'stake' || action === 'withdraw') {
      button.hidden = mode !== (action === 'withdraw' ? 'withdraw' : 'stake');
    }
  }
}

async function refresh() {
  if (!configured) return;
  const revision = ++dataRevision;
  const owner = account;
  let nextCampaign;
  let nextPosition;
  try {
    nextCampaign = await client.campaign();
    if (owner && onExpectedChain && revision === dataRevision) {
      try {
        nextPosition = await client.position(owner, nextCampaign.block);
      } catch {
        // A failed wallet read must not hide the public campaign.
      }
    }
  } catch {
    // Keep writes disabled until the campaign can be read and verified again.
  }
  if (revision !== dataRevision) return;
  campaign = nextCampaign ?? null;
  position = nextPosition ?? null;
  positionUnavailable = Boolean(nextCampaign && owner && onExpectedChain && !nextPosition);
  refreshing = false;
  render();
}

async function walletInfo() {
  const [accounts, chain] = await Promise.all([
    wallet.request({ method: 'eth_accounts' }),
    wallet.request({ method: 'eth_chainId' }),
  ]);
  return {
    owner: isAddress(accounts?.[0]) ? accounts[0].toLowerCase() : null,
    correctChain: BigInt(chain) === BigInt(deployment.chainId),
  };
}

async function syncWallet() {
  if (!wallet) return;
  const revision = ++walletRevision;
  ++dataRevision;
  account = null;
  onExpectedChain = false;
  position = null;
  positionUnavailable = false;
  input.value = '';
  render();
  try {
    const current = await walletInfo();
    if (revision !== walletRevision) return;
    account = current.owner;
    onExpectedChain = current.correctChain;
  } catch {
    if (revision !== walletRevision) return;
  }
  render();
  await refresh();
}

function reportError(error, fallback) {
  const code = Number(error?.code);
  const message = code === 4001 ? 'Request declined in your wallet.'
    : code === -32002 ? 'A request is already open in your wallet.'
    : fallback;
  putText(txNote, message);
}

async function connectWallet() {
  if (!wallet || !campaign || walletBusy || sending) return;
  walletBusy = true;
  render();
  try {
    if (!account) {
      await wallet.request({ method: 'eth_requestAccounts' });
    } else if (!onExpectedChain) {
      const params = [{ chainId: deployment.chainId }];
      try {
        await wallet.request({ method: 'wallet_switchEthereumChain', params });
      } catch (error) {
        if (Number(error?.code) !== 4902) throw error;
        await wallet.request({ method: 'wallet_addEthereumChain', params: [{
          chainId: deployment.chainId,
          chainName: 'Cronos Mainnet',
          rpcUrls: deployment.rpcUrls,
          blockExplorerUrls: [deployment.explorer],
          nativeCurrency: { name: 'Cronos', symbol: 'CRO', decimals: 18 },
        }] });
      }
    }
    putText(txNote, '');
    await syncWallet();
  } catch (error) {
    reportError(error, 'Could not connect to Cronos. Check your wallet and try again.');
  } finally {
    walletBusy = false;
    render();
  }
}

async function checkSigningWallet(owner, revision) {
  const current = await walletInfo();
  if (revision !== walletRevision || current.owner !== owner || !current.correctChain) {
    throw new Error('Wallet changed');
  }
}

async function confirmedReceipt(hash) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const receipt = await client.receipt(hash);
      if (receipt?.status !== undefined) return receipt;
    } catch {
      // A temporary RPC error does not mean the submitted transaction failed.
    }
    await new Promise(resolve => setTimeout(resolve, 2_500));
  }
  return null;
}

async function transact(action) {
  const amount = parseLp(input.value);
  if (!actionAllowed(action, amount)) return;
  if (action === 'emergencyWithdraw' &&
      !window.confirm('Withdraw all LP and permanently forfeit your unclaimed $LEX rewards?')) return;

  const owner = account;
  const revision = walletRevision;
  const amountRequired = action === 'approve' || action === 'stake' || action === 'withdraw';
  const transaction = client.transaction(action, owner, amountRequired ? amount : undefined);
  sending = true;
  txLink.hidden = true;
  putText(txNote, 'Checking your transaction on Cronos…');
  render();
  try {
    await checkSigningWallet(owner, revision);
    const result = await wallet.request({ method: 'eth_call', params: [transaction, 'latest'] });
    if (action === 'approve' && (!isHash(result) || BigInt(result) !== 1n)) {
      throw new Error('LP approval simulation failed');
    }
    const estimate = BigInt(await wallet.request({ method: 'eth_estimateGas', params: [transaction] }));
    if (estimate <= 0n) throw new Error('Gas estimate unavailable');
    // A later block may accrue rewards and write additional storage when mined.
    const gas = '0x' + (estimate + 100_000n).toString(16);
    await checkSigningWallet(owner, revision);
    putText(txNote, actionLabels[action][0]);
    const hash = await wallet.request({
      method: 'eth_sendTransaction',
      params: [{ ...transaction, chainId: deployment.chainId, gas }],
    });
    if (!isHash(hash)) throw new Error('Invalid transaction hash');
    txLink.href = deployment.explorer + '/tx/' + hash;
    txLink.hidden = false;
    putText(txNote, 'Submitted. Waiting for a Cronos confirmation…');
    const receipt = await confirmedReceipt(hash);
    if (!receipt) {
      putText(txNote, 'Still awaiting confirmation. Check the transaction before sending another.');
    } else if (BigInt(receipt.status) !== 1n) {
      putText(txNote, 'Transaction reverted on Cronos. Check the transaction details.');
    } else {
      putText(txNote, actionLabels[action][1]);
      if (amountRequired && action !== 'approve') input.value = '';
    }
  } catch (error) {
    reportError(error, 'Could not complete the request. Check your wallet, amount and network.');
  } finally {
    await refresh();
    sending = false;
    render();
  }
}

function selectMode(nextMode) {
  mode = nextMode;
  input.value = '';
  putText(byId('farm-amount-label'), mode === 'stake' ? 'Amount to stake' : 'Amount to withdraw');
  for (const button of modeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.farmMode === mode));
  }
  render();
}

walletButton.addEventListener('click', connectWallet);
input.addEventListener('input', render);
maxButton.addEventListener('click', () => {
  input.value = formatUnits(amountLimit());
  render();
});
modeButtons.forEach(button => button.addEventListener('click', () => {
  if (!sending) selectMode(button.dataset.farmMode);
}));
actionButtons.forEach(button => button.addEventListener('click', () => transact(button.dataset.farmAction)));

if (configured) {
  const explorer = byId('farm-contract-link');
  explorer.href = deployment.explorer + '/address/' + deployment.farmAddress;
  explorer.hidden = false;
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) wallet?.on?.(event, syncWallet);
  if (wallet) syncWallet();
  else refresh();
  setInterval(refresh, 20_000);
}
render();

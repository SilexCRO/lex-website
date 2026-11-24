const selectors = {
  // LexLpFarm selectors from `forge inspect LexLpFarm methodIdentifiers`.
  stakingToken: '72f702f3',
  rewardToken: 'f7c618c1',
  rewardBudget: '044c9060',
  startTime: '78e97925',
  endTime: '3197cbb6',
  totalStaked: '817b1cd2',
  scheduledRewardsLeft: '99129295',
  stakedBalance: '60217267',
  earned: '008cc262',
  stake: 'a694fc3a',
  withdraw: '2e1a7d4d',
  claim: '4e71d92d',
  exit: 'e9fad8ee',
  emergencyWithdraw: 'db2e21bc',
  // Standard ERC-20 methods.
  balanceOf: '70a08231',
  allowance: 'dd62ed3e',
  approve: '095ea7b3',
};

const unit = 10n ** 18n;
const maxUint = (1n << 256n) - 1n;
export const isAddress = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
export const isHash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);

export function parseLp(value) {
  // Wallet browsers may show a comma decimal key on some keyboards.
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d{1,60}(?:\.\d{0,18})?|\.\d{1,18})$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = BigInt(whole || '0') * unit + BigInt(fraction.padEnd(18, '0'));
  return amount > 0n && amount <= maxUint ? amount : null;
}

export function formatUnits(amount, places = 18) {
  if (amount === 0n) return '0';
  const whole = amount / unit;
  const fraction = (amount % unit).toString().padStart(18, '0').slice(0, places).replace(/0+$/, '');
  if (whole === 0n && !fraction) return '<0.000001';
  return fraction ? whole + '.' + fraction : whole.toString();
}

function data(method, ...args) {
  const words = args.map(arg => {
    const hex = typeof arg === 'bigint' ? arg.toString(16) : arg.slice(2).toLowerCase();
    return hex.padStart(64, '0');
  });
  return '0x' + selectors[method] + words.join('');
}

function uint(word) {
  if (!isHash(word)) throw new Error('Unexpected contract response');
  return BigInt(word);
}

function address(word) {
  if (!isHash(word) || !/^0x0{24}/i.test(word)) throw new Error('Unexpected address response');
  return '0x' + word.slice(-40).toLowerCase();
}

export function createFarmClient(config) {
  const { chainId, farmAddress, lpToken, rewardToken, rpcUrls } = config;

  async function rpc(requests) {
    const batch = requests.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params }));
    for (const url of rpcUrls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7_000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
          signal: controller.signal,
        });
        if (!response.ok) continue;
        const payload = await response.json();
        if (!Array.isArray(payload)) continue;
        const replies = new Map(payload.map(reply => [reply.id, reply]));
        const ordered = batch.map(({ id }) => replies.get(id));
        if (ordered.every(reply => reply && !reply.error && 'result' in reply)) {
          return ordered.map(reply => reply.result);
        }
      } catch {
        // The next Cronos RPC can answer if this one is unreachable.
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error('Cronos data unavailable');
  }

  function readAt(block, calls) {
    return rpc(calls.map(([to, method, ...args]) => [
      'eth_call', [{ to, data: data(method, ...args) }, block],
    ]));
  }

  async function campaign() {
    const [network, latest] = await rpc([
      ['eth_chainId', []],
      ['eth_getBlockByNumber', ['latest', false]],
    ]);
    if (BigInt(network) !== BigInt(chainId) || !latest?.number || !latest.timestamp) {
      throw new Error('Unexpected Cronos chain response');
    }
    const block = latest.number;
    const now = BigInt(latest.timestamp);
    const [lp, reward, start, end, budget, staked, left, held] = await readAt(block, [
      [farmAddress, 'stakingToken'],
      [farmAddress, 'rewardToken'],
      [farmAddress, 'startTime'],
      [farmAddress, 'endTime'],
      [farmAddress, 'rewardBudget'],
      [farmAddress, 'totalStaked'],
      [farmAddress, 'scheduledRewardsLeft'],
      [rewardToken, 'balanceOf', farmAddress],
    ]);
    if (address(lp) !== lpToken.toLowerCase() || address(reward) !== rewardToken.toLowerCase()) {
      throw new Error('Unexpected farm tokens');
    }

    const starts = uint(start);
    const ends = uint(end);
    const remaining = uint(left);
    const allocation = uint(budget);
    const balance = uint(held);
    if (
      allocation === 0n || remaining > allocation ||
      (starts === 0n ? ends !== 0n : starts > now || ends <= starts || balance < remaining)
    ) throw new Error('Unexpected farm schedule');

    const state = starts === 0n ? 'unfunded' : now < ends ? 'active' : 'ended';
    return { block, state, starts, ends, allocation, remaining, balance, staked: uint(staked) };
  }

  async function position(account, block) {
    const [available, staked, earned, allowance] = await readAt(block, [
      [lpToken, 'balanceOf', account],
      [farmAddress, 'stakedBalance', account],
      [farmAddress, 'earned', account],
      [lpToken, 'allowance', account, farmAddress],
    ]);
    return { available: uint(available), staked: uint(staked), earned: uint(earned), allowance: uint(allowance) };
  }

  function transaction(action, account, amount) {
    const approval = action === 'approve';
    const args = approval ? [farmAddress, amount] : amount === undefined ? [] : [amount];
    return { from: account, to: approval ? lpToken : farmAddress, data: data(action, ...args) };
  }

  async function receipt(hash) {
    const [tx] = await rpc([['eth_getTransactionReceipt', [hash]]]);
    return tx;
  }

  return { campaign, position, transaction, receipt };
}

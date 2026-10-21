// Public read-only logs. No wallet access or transaction submission.
(() => {
  const list = document.getElementById('lex-burn-txns');
  const status = document.getElementById('lex-tx-status');
  if (!list || !status) return;
  const token = '0x25B7449E2416e0Ef0f244f6cC34eb31C4902d9Cb';
  const deadTopic = '0x' + '000000000000000000000000000000000000dead'.padStart(64, '0');
  const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const endpoints = ['https://cronos-evm-rpc.publicnode.com', 'https://evm.cronos.com'];
  const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0});
  let running = false;
  async function rpc(endpoint, method, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(endpoint, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal,cache:'no-store'});
      if (!r.ok) throw new Error('RPC unavailable');
      const data = await r.json();
      if (data.error || data.result === undefined) throw new Error('RPC request failed');
      return data.result;
    } finally { clearTimeout(timer); }
  }
  function state(message) {
    const li = document.createElement('li');
    li.className = 'burn-list-state'; li.textContent = message;
    list.replaceChildren(li);
  }
  async function refresh() {
    if (running) return;
    running = true;
    try {
      for (const endpoint of endpoints) {
        try {
          const rawBlock = await rpc(endpoint, 'eth_blockNumber', []);
          if (!/^0x[0-9a-f]+$/i.test(rawBlock)) throw new Error('Invalid block');
          const end = BigInt(rawBlock) - 12n; // Avoid the unconfirmed tip.
          const start = end > 49999n ? end - 49999n : 0n;
          const requests = [];
          for (let from = start; from <= end; from += 10000n) {
            const to = from + 9999n > end ? end : from + 9999n;
            requests.push(rpc(endpoint, 'eth_getLogs', [{address:token,fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16),topics:[transfer,null,deadTopic]}]));
          }
          const batches = await Promise.all(requests);
          if (batches.some(x => !Array.isArray(x))) throw new Error('Invalid logs');
          const byTx = new Map();
          for (const log of batches.flat()) {
            if (log.removed || log.address?.toLowerCase() !== token.toLowerCase() || log.topics?.[0]?.toLowerCase() !== transfer || log.topics?.[2]?.toLowerCase() !== deadTopic || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash) || !/^0x[0-9a-f]{64}$/i.test(log.topics?.[1]) || !/^0x[0-9a-f]+$/i.test(log.data) || !/^0x[0-9a-f]+$/i.test(log.blockNumber)) continue;
            const value = BigInt(log.data);
            if (value <= 0n) continue;
            const existing = byTx.get(log.transactionHash);
            if (existing) existing.value += value;
            else byTx.set(log.transactionHash, {hash:log.transactionHash,from:'0x'+log.topics[1].slice(-40),block:BigInt(log.blockNumber),value});
          }
          const logs = [...byTx.values()].sort((a,b) => a.block > b.block ? -1 : a.block < b.block ? 1 : 0).slice(0,5);
          if (!logs.length) state('No LEX burns found in the latest 50,000 blocks. Open the explorer for older transfers.');
          else {
            const rows = logs.map(log => {
              const li = document.createElement('li'); li.className = 'burn-txn';
              const a = document.createElement('a'); a.href = 'https://explorer.cronos.com/tx/'+log.hash; a.target='_blank'; a.rel='noopener noreferrer';
              a.textContent = log.hash.slice(0,10)+'…'+log.hash.slice(-6)+' ↗';
              const small = document.createElement('small'); small.textContent='From '+log.from.slice(0,6)+'…'+log.from.slice(-4)+' · block '+number.format(log.block);
              a.append(small);
              const amount = document.createElement('strong');
              const unit = 10n**18n;
              amount.textContent = log.value < unit ? '< 1 $LEX' : number.format(log.value/unit)+' $LEX';
              amount.title = (log.value/unit).toString()+'.'+(log.value%unit).toString().padStart(18,'0')+' LEX';
              li.append(a,amount); return li;
            });
            list.replaceChildren(...rows);
          }
          status.textContent='Checked '+new Date().toLocaleTimeString('en-GB')+' · scanned blocks '+number.format(start)+'–'+number.format(end)+'. History refreshes every five minutes.';
          return;
        } catch { /* Try the other public endpoint. */ }
      }
      state('Recent transfers are temporarily unavailable. Use the explorer to check the full on-chain history.');
      status.textContent='The public RPC could not return the recent transfer logs. No estimated transactions are shown.';
    } finally { running=false; }
  }
  refresh();
  window.setInterval(refresh,300000);
})();

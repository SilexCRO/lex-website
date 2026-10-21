// Read-only Cronos calls. A failed refresh never leaves an old value labeled live.
(() => {
  const token = '0x25B7449E2416e0Ef0f244f6cC34eb31C4902d9Cb';
  const dead = '000000000000000000000000000000000000dead';
  const endpoints = ['https://cronos-evm-rpc.publicnode.com', 'https://evm.cronos.com'];
  const total = document.getElementById('lex-total-supply');
  const burned = document.getElementById('lex-burned-supply');
  const percent = document.getElementById('lex-burn-percent');
  const note = document.getElementById('lex-stats-note');
  if (!total || !burned || !percent || !note) return;
  const originalNote = note.textContent;
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  async function snapshot(endpoint) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const request = async (method, params, id) => {
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
          signal: controller.signal, cache: 'no-store'
        });
        if (!response.ok) throw new Error('Cronos request failed');
        const result = await response.json();
        if (result.error || !/^0x[0-9a-f]+$/i.test(result.result)) throw new Error('Invalid Cronos result');
        return result.result;
      };
      const block = await request('eth_blockNumber', [], 1);
      // All three values come from one endpoint and one block.
      const [rawSupply, rawBurned, rawDecimals] = await Promise.all([
        request('eth_call', [{ to: token, data: '0x18160ddd' }, block], 2),
        request('eth_call', [{ to: token, data: '0x70a08231' + dead.padStart(64, '0') }, block], 3),
        request('eth_call', [{ to: token, data: '0x313ce567' }, block], 4)
      ]);
      const decimals = Number(BigInt(rawDecimals));
      const supply = BigInt(rawSupply), balance = BigInt(rawBurned);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || supply <= 0n || balance > supply) throw new Error('Invalid token values');
      return { supply, balance, unit: 10n ** BigInt(decimals), block };
    } finally { clearTimeout(timeout); }
  }
  async function refresh() {
    for (const endpoint of endpoints) {
      try {
        const { supply, balance, unit, block } = await snapshot(endpoint);
        total.textContent = number.format(supply / unit) + ' $LEX';
        burned.textContent = number.format(balance / unit) + ' $LEX';
        percent.textContent = (Number(balance * 10000n / supply) / 100).toFixed(2) + '%';
        const pct = Number(balance * 10000n / supply) / 100;
        const fill = document.getElementById('lex-burn-fill');
        const progress = document.getElementById('lex-burn-progress');
        if (fill) fill.style.width = pct + '%';
        if (progress) progress.setAttribute('aria-valuenow', pct.toFixed(2));
        note.textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB') + ' · Cronos block ' + BigInt(block).toLocaleString('en-US') + ' · refreshes every 60 seconds.';
        return;
      } catch { /* Try the other public endpoint. */ }
    }
    burned.textContent = 'Unavailable';
    percent.textContent = 'Unavailable';
    const fill = document.getElementById('lex-burn-fill');
    const progress = document.getElementById('lex-burn-progress');
    if (fill) fill.style.width = '0%';
    if (progress) progress.removeAttribute('aria-valuenow');
    note.replaceChildren(document.createTextNode('Live data is temporarily unavailable. '));
    const link = document.createElement('a');
    link.href = 'https://explorer.cronos.com/token/' + token;
    link.textContent = 'Check the token on Cronos Explorer';
    note.append(link);
  }
  refresh();
  window.setInterval(refresh, 60000);
})();

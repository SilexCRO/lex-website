// Visual previews only. No wallet, signature or transaction requests.
(() => {
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const status = button.closest('.address-card, .card')?.querySelector('.copy-status');
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        if (status) status.textContent = 'Address copied.';
      } catch {
        if (status) status.textContent = 'Select the address above to copy it.';
      }
    });
  });
  let swapMode = 'buy';
  const cro = '<span class="coin-circle">C</span>CRO';
  const lex = '<img src="/assets/lex-token-logo.png" width="30" height="30" alt="">LEX';
  function selectSwap(mode) {
    swapMode = mode;
    document.querySelectorAll('[data-swap-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.swapMode === mode)));
    document.getElementById('pay-token').innerHTML = mode === 'buy' ? cro : lex;
    document.getElementById('receive-token').innerHTML = mode === 'buy' ? lex : cro;
  }
  document.querySelectorAll('[data-swap-mode]').forEach(b => b.addEventListener('click', () => selectSwap(b.dataset.swapMode)));
  document.querySelector('[data-swap-reverse]')?.addEventListener('click', () => selectSwap(swapMode === 'buy' ? 'sell' : 'buy'));
  document.querySelectorAll('[data-stake-tab]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-stake-tab]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.getElementById('stake-label').textContent = button.dataset.stakeTab === 'stake' ? 'Amount to stake' : 'Amount to unstake';
  }));
})();

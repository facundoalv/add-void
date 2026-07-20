(function () {
  const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  const toggle = document.getElementById('toggleState');
  const envStatus = document.getElementById('envStatus');
  const mocksCount = document.getElementById('mocksCount');
  const payloadsCount = document.getElementById('payloadsCount');
  const cssCount = document.getElementById('cssCount');

  function renderState(state) {
    if (!state) {
      envStatus.textContent = 'No state available';
      return;
    }

    const { environment, counters, enabled } = state;
    toggle.checked = enabled !== false;
    envStatus.textContent = `MAIN_WORLD=ON | fetch=${environment?.fetchMasked ? 'masked' : 'native'} | XHR=${environment?.xhrMasked ? 'masked' : 'native'}`;
    mocksCount.textContent = String(counters?.mocks || 0);
    payloadsCount.textContent = String(counters?.payloads || 0);
    cssCount.textContent = String(counters?.cssRules || 0);
  }

  function refreshState() {
    runtime?.sendMessage({ type: 'queryState', tabId: undefined }, (state) => {
      renderState(state);
    });
  }

  toggle.addEventListener('change', () => {
    runtime?.sendMessage({ type: 'toggle', enabled: toggle.checked }, (state) => {
      renderState(state);
    });
  });

  refreshState();
  window.setInterval(refreshState, 1200);
})();

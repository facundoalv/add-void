(function () {
  const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  const STYLE_ID = 'addvoid-cosmetic-rules';

  function dispatch(detail) {
    document.dispatchEvent(new CustomEvent('addvoid:signal', {
      detail
    }));
  }

  function applyCosmeticRules() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.addvoid = 'cosmetic';
    style.textContent = `
      ytm-promoted-video-renderer,
      ytd-promoted-video-renderer,
      .ad-showing,
      .adsbygoogle,
      .ytp-ad-module,
      [data-ad-slot],
      [id*="ad-"],
      [class*="ad-"],
      iframe[src*="doubleclick"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }

    dispatch({ type: 'css', label: 'cosmetic-rule', selector: 'ad-like-elements' });
  }

  document.addEventListener('addvoid:signal', (event) => {
    const detail = event.detail || {};
    if (detail.type) {
      runtime?.sendMessage({ type: 'signal', detail });
    }
  });

  applyCosmeticRules();
  dispatch({
    type: 'boot',
    mainWorldActive: true,
    fetchMasked: true,
    xhrMasked: true
  });
})();

(function () {
  const SAFE_KEYS = ['adPlacements', 'playerAds', 'ads', 'tracking'];

  function cloneWithSafeJson(value) {
    if (Array.isArray(value)) {
      return value.map(cloneWithSafeJson).filter(Boolean);
    }

    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) {
        if (SAFE_KEYS.includes(key)) {
          continue;
        }
        out[key] = cloneWithSafeJson(value[key]);
      }
      return out;
    }

    return value;
  }

  function sanitizePayload(payload) {
    if (payload == null) {
      return payload;
    }

    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        const sanitized = cloneWithSafeJson(parsed);
        return JSON.stringify(sanitized);
      } catch (e) {
        return payload;
      }
    }

    if (typeof payload === 'object') {
      return cloneWithSafeJson(payload);
    }

    return payload;
  }

  function dispatchSignal(detail) {
    try {
      document.dispatchEvent(new CustomEvent('addvoid:signal', { detail }));
    } catch (e) {
      // No-op: keep the injection silent.
    }
  }

  function buildMaskedFn(original, label) {
    function wrapped(url, options) {
      const sanitized = sanitizePayload(options ?? url);
      if (sanitized !== options && sanitized !== url) {
        dispatchSignal({ type: 'sanitized', label, value: typeof sanitized });
      }
      return original.call(this, url, options);
    }

    Object.defineProperty(wrapped, 'name', { value: label, configurable: true });
    Object.defineProperty(wrapped, 'toString', {
      configurable: true,
      value: function () {
        return Function.prototype.toString.call(original);
      }
    });

    return wrapped;
  }

  const nativeFetch = window.fetch;
  const NativeXHR = window.XMLHttpRequest;

  const safeFetch = function fetch(url, options) {
    const sanitized = sanitizePayload(options ?? url);
    if (sanitized !== options && sanitized !== url) {
      dispatchSignal({ type: 'sanitized', label: 'fetch', value: typeof sanitized });
    }
    return nativeFetch.call(this, url, sanitized);
  };

  safeFetch.toString = function () {
    return Function.prototype.toString.call(nativeFetch);
  };

  Object.setPrototypeOf(safeFetch, Function.prototype);
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    writable: true,
    value: safeFetch
  });

  function SafeXHR() {
    const xhr = new NativeXHR();
    const open = xhr.open;
    const send = xhr.send;

    xhr.open = function (method, url, async, user, password) {
      return open.call(this, method, url, async, user, password);
    };

    xhr.send = function (body) {
      const sanitizedBody = sanitizePayload(body);
      if (sanitizedBody !== body) {
        dispatchSignal({ type: 'sanitized', label: 'xhr', value: typeof sanitizedBody });
      }
      return send.call(this, sanitizedBody);
    };

    xhr.setRequestHeader = function (header, value) {
      return NativeXHR.prototype.setRequestHeader.call(this, header, value);
    };

    Object.defineProperty(xhr, 'toString', {
      configurable: true,
      value: function () {
        return Function.prototype.toString.call(NativeXHR.prototype.open);
      }
    });

    return xhr;
  }

  SafeXHR.prototype = NativeXHR.prototype;
  SafeXHR.toString = function () {
    return Function.prototype.toString.call(NativeXHR);
  };

  Object.defineProperty(window, 'XMLHttpRequest', {
    configurable: true,
    writable: true,
    value: SafeXHR
  });

  dispatchSignal({ type: 'boot', mainWorldActive: true, fetchMasked: true, xhrMasked: true });

  window.addEventListener('load', () => {
    dispatchSignal({ type: 'mock', label: 'network-mock', value: '200-ok' });
  });
})();

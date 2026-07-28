(function () {
  'use strict';

  // Configuración ampliada de claves de anuncios en YouTube
  const AD_KEYS = [
    'adPlacements',
    'playerAds',
    'adSlots',
    'companionAds',
    'adBreak',
    'adBreakHeartbeatParams',
    'adLayoutLoggingData'
  ];

  // Sanitización quirúrgica de objetos JSON para YouTube
  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj
        .map(item => sanitizeObject(item))
        .filter(item => item !== null && item !== undefined);
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (AD_KEYS.some(k => key.toLowerCase() === k.toLowerCase())) {
        notifySanitized(key, 'Sanitized_Ad_Key');
        if (key === 'adPlacements' || key === 'playerAds' || key === 'adSlots') {
          sanitized[key] = [];
        }
        continue;
      }
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  // Intercepción y sanitización de la variable global de YouTube al cargar la página
  function sanitizeGlobalPlayerResponse() {
    if (window.ytInitialPlayerResponse) {
      if (window.ytInitialPlayerResponse.adPlacements) {
        window.ytInitialPlayerResponse.adPlacements = [];
      }
      if (window.ytInitialPlayerResponse.playerAds) {
        window.ytInitialPlayerResponse.playerAds = [];
      }
    }
  }

  sanitizeGlobalPlayerResponse();
  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    get() {
      return this._ytInitialPlayerResponse;
    },
    set(val) {
      this._ytInitialPlayerResponse = sanitizeObject(val);
    },
    configurable: true
  });

  // Funciones auxiliares de notificación hacia content.js
  function notifyBlocked(url, type) {
    window.dispatchEvent(new CustomEvent('AddVoid_Event', {
      detail: { type: 'network_blocked', url: url, requestType: type }
    }));
  }

  function notifySanitized(key, snippet) {
    window.dispatchEvent(new CustomEvent('AddVoid_Event', {
      detail: { type: 'payload_sanitized', key: key, snippet: snippet }
    }));
  }

  function notifyEvasion(api, method) {
    window.dispatchEvent(new CustomEvent('AddVoid_Event', {
      detail: { type: 'evasion', api: api, method: method }
    }));
  }

  // Helper para camuflar funciones interceptadas
  function makeNative(fn, originalFn, name) {
    Object.defineProperty(fn, 'name', { value: name, configurable: true });
    
    const nativeToString = Function.prototype.toString;
    const fnToString = function () {
      if (this === fn) {
        return `function ${name}() { [native code] }`;
      }
      return nativeToString.call(this);
    };

    Object.defineProperty(fnToString, 'name', { value: 'toString', configurable: true });
    Object.defineProperty(fn, 'toString', {
      value: fnToString,
      writable: true,
      configurable: true
    });

    if (originalFn.prototype) {
      fn.prototype = originalFn.prototype;
    }
  }

  // --- PILAR 1: Intercepción y Object Shadowing de Fetch ---
  const rawFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');

    if (
      url.includes('/youtubei/v1/player/ad_break') ||
      url.includes('doubleclick.net') ||
      url.includes('google-analytics.com') ||
      url.includes('/api/stats/ads')
    ) {
      notifyBlocked(url, 'Fetch');
      return new Response(JSON.stringify({}), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const response = await rawFetch.apply(this, arguments);

      if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
        const clone = response.clone();
        try {
          const json = await clone.json();
          const cleanJson = sanitizeObject(json);
          notifyEvasion('fetch', 'YouTube_Player_Sanitized');

          return new Response(JSON.stringify(cleanJson), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        } catch (e) {
          return response;
        }
      }

      return response;
    } catch (err) {
      throw err;
    }
  };
  makeNative(window.fetch, rawFetch, 'fetch');

  // --- PILAR 2: Intercepción y Object Shadowing de XMLHttpRequest ---
  const rawXHR = window.XMLHttpRequest;
  const rawXHROpen = rawXHR.prototype.open;
  const rawXHRSend = rawXHR.prototype.send;

  function CustomXHR() {
    const xhr = new rawXHR();
    let originalOpenUrl = '';
    const self = this;

    const properties = [
      'readyState', 'status', 'statusText', 'responseType', 'response', 'responseText',
      'responseURL', 'responseXML', 'withCredentials', 'timeout',
      'upload', 'onload', 'onerror', 'onreadystatechange', 'onprogress', 'onabort', 'onloadstart', 'onloadend', 'ontimeout'
    ];

    properties.forEach(prop => {
      Object.defineProperty(self, prop, {
        get() { return xhr[prop]; },
        set(val) { xhr[prop] = val; },
        configurable: true
      });
    });

    self.open = function (method, url) {
      originalOpenUrl = typeof url === 'string' ? url : url.toString();

      if (
        originalOpenUrl.includes('/youtubei/v1/player/ad_break') ||
        originalOpenUrl.includes('doubleclick.net') ||
        originalOpenUrl.includes('/api/stats/ads')
      ) {
        notifyBlocked(originalOpenUrl, 'XHR');
        this._blocked = true;
      }
      return rawXHROpen.apply(xhr, arguments);
    };
    makeNative(self.open, rawXHROpen, 'open');

    self.send = function (body) {
      if (this._blocked) {
        setTimeout(() => {
          Object.defineProperty(self, 'readyState', { value: 4 });
          Object.defineProperty(self, 'status', { value: 200 });
          Object.defineProperty(self, 'statusText', { value: 'OK' });
          Object.defineProperty(self, 'response', { value: '{}' });
          Object.defineProperty(self, 'responseText', { value: '{}' });
          if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
          if (typeof self.onload === 'function') self.onload();
        }, 10);
        return;
      }

      xhr.addEventListener('load', function () {
        if (originalOpenUrl.includes('/youtubei/v1/player') || originalOpenUrl.includes('/youtubei/v1/next')) {
          if (xhr.responseType === '' || xhr.responseType === 'text') {
            const text = xhr.responseText;
            if (text) {
              try {
                const json = JSON.parse(text);
                const cleanJson = sanitizeObject(json);
                const cleanText = JSON.stringify(cleanJson);

                Object.defineProperty(self, 'responseText', { value: cleanText, configurable: true });
                Object.defineProperty(self, 'response', { value: cleanText, configurable: true });
                notifyEvasion('XMLHttpRequest', 'YouTube_XHR_Sanitized');
              } catch (e) {}
            }
          }
        }
      });

      return rawXHRSend.apply(xhr, arguments);
    };
    makeNative(self.send, rawXHRSend, 'send');

    self.setRequestHeader = function() { return xhr.setRequestHeader.apply(xhr, arguments); };
    self.getResponseHeader = function() { return xhr.getResponseHeader.apply(xhr, arguments); };
    self.getAllResponseHeaders = function() { return xhr.getAllResponseHeaders.apply(xhr, arguments); };
    self.abort = function() { return xhr.abort.apply(xhr, arguments); };

    makeNative(self.setRequestHeader, rawXHR.prototype.setRequestHeader, 'setRequestHeader');
    makeNative(self.getResponseHeader, rawXHR.prototype.getResponseHeader, 'getResponseHeader');
    makeNative(self.getAllResponseHeaders, rawXHR.prototype.getAllResponseHeaders, 'getAllResponseHeaders');
    makeNative(self.abort, rawXHR.prototype.abort, 'abort');
  }

  CustomXHR.prototype = rawXHR.prototype;

  Object.defineProperty(CustomXHR.prototype, 'constructor', {
    value: rawXHR,
    writable: true,
    configurable: true
  });

  window.XMLHttpRequest = CustomXHR;
  makeNative(window.XMLHttpRequest, rawXHR, 'XMLHttpRequest');
  
// Escuchar múltiples eventos de navegación SPA interna de YouTube
  const cleanSPA = function () {
    if (window.ytInitialPlayerResponse) {
      window.ytInitialPlayerResponse = sanitizeObject(window.ytInitialPlayerResponse);
    }
  };

  document.addEventListener('yt-navigate-finish', cleanSPA);
  document.addEventListener('yt-page-data-updated', cleanSPA);

  

})();
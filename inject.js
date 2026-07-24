(function () {
  'use strict';

  // Configuración de palabras clave para sanitizar payloads JSON de anuncios
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'companionAds', 'adBreak'];

  // Función de sanitización recursiva de objetos JSON
  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (AD_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        // Enviar notificación de sanitización
        notifySanitized(key, JSON.stringify(value).substring(0, 80));
        continue; // Excluir propiedad con anuncios
      }
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  // Utilidad de notificación mediante CustomEvent seguro hacia el Isolated World (content.js)
  function notifyBlocked(url, type) {
    const event = new CustomEvent('AddVoid_Event', {
      detail: { type: 'network_blocked', url: url, requestType: type }
    });
    window.dispatchEvent(event);
  }

  function notifySanitized(key, snippet) {
    const event = new CustomEvent('AddVoid_Event', {
      detail: { type: 'payload_sanitized', key: key, snippet: snippet }
    });
    window.dispatchEvent(event);
  }

  function notifyEvasion(api, method) {
    const event = new CustomEvent('AddVoid_Event', {
      detail: { type: 'evasion', api: api, method: method }
    });
    window.dispatchEvent(event);
  }

  // Helper para camuflar funciones interceptadas
  function makeNative(fn, originalFn, name) {
    // Redefinición segura de toString para engañar verificaciones reflexivas
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

    // Replicar propiedades de prototipo originales si existen
    if (originalFn.prototype) {
      fn.prototype = originalFn.prototype;
    }
  }

  // --- PILAR 2: Intercepción y Object Shadowing de Fetch ---
  const rawFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    
    // Simular bloqueo/redirección de endpoints de anuncios conocidos
    if (url.includes('/youtubei/v1/player/ad_break') || url.includes('doubleclick.net') || url.includes('google-analytics.com')) {
      notifyBlocked(url, 'Fetch');
      // Devolver mock response 200 OK limpio
      return new Response(JSON.stringify({}), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const response = await rawFetch.apply(this, arguments);
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // Clonar para procesar sin corromper la lectura original si falla
        const clone = response.clone();
        try {
          const json = await clone.json();
          const hasAdKeys = AD_KEYS.some(key => JSON.stringify(json).includes(key));
          if (hasAdKeys) {
            const cleanJson = sanitizeObject(json);
            notifyEvasion('fetch', 'JSON_Sanitizer');
            return new Response(JSON.stringify(cleanJson), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        } catch (e) {
          // Ignorar error de análisis JSON y continuar con respuesta original
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
    
    // Lista completa de propiedades e instancias de eventos para compatibilidad total
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
      
      if (originalOpenUrl.includes('/youtubei/v1/player/ad_break') || originalOpenUrl.includes('doubleclick.net')) {
        notifyBlocked(originalOpenUrl, 'XHR');
        // Marcar estado internamente como bloqueado/simulado
        this._blocked = true;
      }
      return rawXHROpen.apply(xhr, arguments);
    };
    makeNative(self.open, rawXHROpen, 'open');

    self.send = function (body) {
      if (this._blocked) {
        // Despachar evento onload simulando 200 OK instantáneo
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

      // Configurar escucha para interceptar carga de respuestas reales
      const originalOnLoad = xhr.onload;
      xhr.onload = function () {
        if (xhr.responseType === '' || xhr.responseType === 'text') {
          const text = xhr.responseText;
          const hasAdKeys = AD_KEYS.some(key => text.includes(key));
          if (hasAdKeys) {
            try {
              const json = JSON.parse(text);
              const cleanJson = sanitizeObject(json);
              const cleanText = JSON.stringify(cleanJson);
              
              Object.defineProperty(self, 'responseText', { value: cleanText, configurable: true });
              Object.defineProperty(self, 'response', { value: cleanText, configurable: true });
              notifyEvasion('XMLHttpRequest', 'Payload_Sanitized');
            } catch (e) {}
          }
        }
        if (typeof originalOnLoad === 'function') {
          originalOnLoad.apply(xhr, arguments);
        } else if (typeof self.onload === 'function') {
          self.onload.apply(xhr, arguments);
        }
      };

      return rawXHRSend.apply(xhr, arguments);
    };
    makeNative(self.send, rawXHRSend, 'send');

    // Copiar resto de métodos nativos
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
  
  // Asignación de constructor en el prototype para camuflar instanceof
  Object.defineProperty(CustomXHR.prototype, 'constructor', {
    value: rawXHR,
    writable: true,
    configurable: true
  });

  window.XMLHttpRequest = CustomXHR;
  makeNative(window.XMLHttpRequest, rawXHR, 'XMLHttpRequest');

  console.log('[AddVoid] Evasión de telemetría y Shadowing de MAIN world activo.');
})();
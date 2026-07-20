(function () {
// [+] Inicialización y Estado Global
// Detecta si corre en Chrome o Firefox y crea el almacén en memoria para los contadores de cada pestaña.
    const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  const tabsApi = globalThis.browser?.tabs || globalThis.chrome?.tabs;

  const state = {
    activeTabId: null,
    tabs: {}
  };
// [+] Gestion y Estrucutra de Pestañas
// Asegura que una pestaña tenga su estructura inicializada con los valores por defecto
  function ensureTabEntry(tabId) {
    if (!state.tabs[tabId]) {
      state.tabs[tabId] = {
        enabled: true,
        environment: {
          mainWorldActive: true,
          fetchMasked: true,
          xhrMasked: true
        },
        counters: {
          mocks: 0,
          payloads: 0,
          cssRules: 0
        },
        lastEvent: null,
        lastUpdated: Date.now()
      };
    }
    return state.tabs[tabId];
  }

// Devuelve una copia limpia (snapshot) de los datos de la pestaña solicitada.
  function snapshotForTab(tabId) {
    const entry = ensureTabEntry(tabId);
    return {
      tabId,
      enabled: entry.enabled,
      environment: entry.environment,
      counters: entry.counters,
      lastEvent: entry.lastEvent,
      lastUpdated: entry.lastUpdated
    };
  }

// Permite actualizar parcialmente el estado de una pestaña de forma segura.
  function updateEntry(tabId, patch) {
    const entry = ensureTabEntry(tabId);
    Object.assign(entry, patch);
    entry.lastUpdated = Date.now();
    return snapshotForTab(tabId);
  }

// [+] Procesamiento de Señales 
// Escucha los eventos del script inyectado y actualiza los contadores según la acción realizada en la web.
  function handleSignal(message, sender) {
    const tabId = sender?.tab?.id ?? state.activeTabId ?? 0;
    const entry = ensureTabEntry(tabId);
    // Al arrancar, verifica si el MAIN_WORLD y el enmascaramiento de fetch/XHR están activos.
    if (message?.detail?.type === 'boot') {
      entry.environment = {
        mainWorldActive: Boolean(message.detail.mainWorldActive),
        fetchMasked: Boolean(message.detail.fetchMasked),
        xhrMasked: Boolean(message.detail.xhrMasked)
      };
      entry.lastEvent = message.detail;
      entry.lastUpdated = Date.now();
      return snapshotForTab(tabId);
    }
    // Suma 1 si se desvió una petición con éxito usando un script señuelo (falso 200 OK).
    if (message?.detail?.type === 'mock') {
      entry.counters.mocks += 1;
      entry.lastEvent = message.detail;
      entry.lastUpdated = Date.now();
      return snapshotForTab(tabId);
    }
    // Suma 1 si se interceptó y sanitizó un payload JSON (por ejemplo, removiendo bloques de anuncios).
    if (message?.detail?.type === 'sanitized') {
      entry.counters.payloads += 1;
      entry.lastEvent = message.detail;
      entry.lastUpdated = Date.now();
      return snapshotForTab(tabId);
    }
    // Suma 1 si se inyectó una regla estética inmutable para ocultar un banner.
    if (message?.detail?.type === 'css') {
      entry.counters.cssRules += 1;
      entry.lastEvent = message.detail;
      entry.lastUpdated = Date.now();
      return snapshotForTab(tabId);
    }

    return snapshotForTab(tabId);
  }
// [+] Control del Ciclo de Vida del Navegador
// Registra qué pestaña está viendo el usuario en tiempo real.
  tabsApi?.onActivated?.addListener(({ tabId }) => {
    state.activeTabId = tabId;
  });
// Limpieza de memoria: borra los datos acumulados de la pestaña cuando el usuario la cierra.
  tabsApi?.onRemoved?.addListener((tabId) => {
    delete state.tabs[tabId];
  });
// Resetea el registro de pestaña activa al instalar o actualizar la extensión.
  runtime?.onInstalled?.addListener(() => {
    state.activeTabId = null;
  });
// [+] Enrutador Central de Mensajes (API de Comunicación)
// Atiende todas las peticiones asincrónicas que cruzan los límites de los entornos aislados.
  runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return false;
    }
    // Caso A: Llega una señal de bloqueo desde la página -> Actualiza contadores.
    if (message.type === 'signal') {
      const snapshot = handleSignal(message, sender);
      sendResponse(snapshot);
      return true;
    }
    // Caso B: El Popup se abre y pregunta -> Le devuelve los contadores actuales.
    if (message.type === 'queryState') {
      const tabId = message.tabId ?? state.activeTabId ?? 0;
      sendResponse(snapshotForTab(tabId));
      return true;
    }
    // Caso C: El usuario toca el botón On/Off del Popup -> Modifica el estado global.
    if (message.type === 'toggle') {
      const tabId = message.tabId ?? state.activeTabId ?? 0;
      const entry = ensureTabEntry(tabId);
      entry.enabled = Boolean(message.enabled);
      entry.lastEvent = { type: 'toggle', enabled: entry.enabled };
      entry.lastUpdated = Date.now();
      sendResponse(snapshotForTab(tabId));
      return true;
    }

    return false; // Mensaje no reconocido
  });
})();

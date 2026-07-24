document.addEventListener('DOMContentLoaded', () => {
  const runtimeApi = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  const tabsApi = globalThis.browser?.tabs || globalThis.chrome?.tabs;

  const statusToggle = document.getElementById('status-toggle');
  const envBadge = document.getElementById('env-badge');
  const countMocks = document.getElementById('count-mocks');
  const countSanitized = document.getElementById('count-sanitized');
  const countCosmetic = document.getElementById('count-cosmetic');
  const consoleBox = document.getElementById('console');

  // Obtener pestaña de navegador activa para filtrar estadísticas correspondientes
  async function getActiveTabId() {
    try {
      const [tab] = await tabsApi.query({ active: true, currentWindow: true });
      return tab ? tab.id : null;
    } catch (e) {
      console.warn('Error resolviendo active tab:', e);
      return null;
    }
  }

  // Actualizar UI con el estado del almacén de datos del Service Worker
  function renderStats(stats, logs) {
    if (!stats) return;

    // Actualizar interruptor general
    statusToggle.checked = stats.isEnabled;

    if (stats.isEnabled) {
      envBadge.textContent = '⚡ CONTEXTO MAIN_WORLD SEGURO Y ACTIVO';
      envBadge.className = 'status-badge';
      document.querySelectorAll('.stat-card').forEach(card => card.classList.remove('inactive'));
    } else {
      envBadge.textContent = '⚠ PROTECCIÓN DESACTIVADA EN ESTA PESTAÑA';
      envBadge.className = 'status-badge inactive';
      document.querySelectorAll('.stat-card').forEach(card => card.classList.add('inactive'));
    }

    // Contadores dinámicos
    countMocks.textContent = stats.mocksBlocked;
    countSanitized.textContent = stats.payloadsSanitized;
    countCosmetic.textContent = stats.cosmeticRulesApplied;

    // Renderizar consola de logs de forma segura para evitar XSS
    if (logs && consoleBox) {
      consoleBox.innerHTML = '';
      logs.forEach(log => {
        const line = document.createElement('div');
        line.className = 'log-line';
        
        let colorClass = 'type-info';
        if (log.type === 'network_blocked') colorClass = 'type-blocked';
        else if (log.type === 'payload_sanitized') colorClass = 'type-sanitized';
        else if (log.type === 'cosmetic') colorClass = 'type-cosmetic';
        else if (log.type === 'evasion') colorClass = 'type-evasion';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${log.timestamp ? log.timestamp.substring(0, 5) : '--:--'}]`;

        const srcSpan = document.createElement('span');
        srcSpan.className = 'log-src';
        srcSpan.textContent = `[${log.source || 'sys'}]`;

        const msgSpan = document.createElement('span');
        msgSpan.className = colorClass;
        msgSpan.textContent = log.message;

        line.appendChild(timeSpan);
        line.appendChild(srcSpan);
        line.appendChild(msgSpan);

        consoleBox.appendChild(line);
      });
    }
  }

  // Cargar datos actuales desde el background
  async function loadData() {
    const tabId = await getActiveTabId();
    if (!tabId) return;

    runtimeApi.sendMessage({ type: 'GET_CURRENT_STATS', tabId: tabId }, (response) => {
      if (runtimeApi.lastError) {
        console.warn('Runtime error:', runtimeApi.lastError.message);
        return;
      }
      if (response && response.stats) {
        renderStats(response.stats, response.logs);
      }
    });
  }

  // Alternar el estado On/Off de la pestaña
  statusToggle.addEventListener('change', async () => {
    const tabId = await getActiveTabId();
    if (!tabId) return;

    runtimeApi.sendMessage({
      type: 'TOGGLE_STATUS',
      tabId: tabId,
      enabled: statusToggle.checked
    }, (response) => {
      if (response && response.stats) {
        renderStats(response.stats, response.stats.logs);
      }
    });
  });

  // Suscribirse a actualizaciones en vivo enviadas por el Service Worker
  runtimeApi.onMessage.addListener((message) => {
    getActiveTabId().then(currentTabId => {
      if (message.type === 'LIVE_LOG' && message.tabId === currentTabId) {
        renderStats(message.stats, message.stats.logs);
      }
    });
  });

  // Ejecutar carga inicial
  loadData();
});
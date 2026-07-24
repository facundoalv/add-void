// Almacén en memoria de estadísticas agrupadas por pestaña (tabId)
const tabStats = {};

// Obtener o inicializar estructura de stats para un tabId
function getOrCreateStats(tabId) {
  if (!tabStats[tabId]) {
    tabStats[tabId] = {
      mocksBlocked: 0,
      payloadsSanitized: 0,
      cosmeticRulesApplied: 0,
      environmentStatus: 'SECURE_MAIN_WORLD',
      isEnabled: true,
      logs: []
    };
  }
  return tabStats[tabId];
}

// Agregar log con límite de tamaño para evitar sobrecarga de memoria
function addLog(tabId, type, message, source) {
  const stats = getOrCreateStats(tabId);
  const logEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    type: type,
    message: message,
    source: source
  };
  stats.logs.unshift(logEntry);
  if (stats.logs.length > 50) {
    stats.logs.pop();
  }
  
  // Opcional: Enviar broadcast si el Popup está abierto escuchando
  chrome.runtime.sendMessage({
    type: 'LIVE_LOG',
    tabId: tabId,
    log: logEntry,
    stats: stats
  }).catch(() => {
    // Silenciar error esperado cuando el Popup está cerrado
  });
}

// Escucha de conexiones y mensajes de content_scripts o popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : request.tabId;
  
  if (!tabId) {
    if (request.type === 'GET_CURRENT_STATS') {
      sendResponse({ error: 'Tab no identificado' });
    }
    return true;
  }

  const stats = getOrCreateStats(tabId);

  switch (request.type) {
    case 'COSMETIC_APPLIED':
      stats.cosmeticRulesApplied = request.count;
      addLog(tabId, 'cosmetic', `Aplicadas ${request.count} reglas cosméticas inmutables.`, 'content.js');
      break;

    case 'LOG_EVENT':
      addLog(tabId, request.logType, request.message, request.source);
      break;

    case 'METRIC_UPDATE':
      const metric = request.metric;
      if (metric.type === 'network_blocked') {
        stats.mocksBlocked++;
        addLog(tabId, 'network_blocked', `Petición desviada con éxito: ${metric.url.substring(0, 50)}... (${metric.requestType} simulado)`, 'inject.js');
      } else if (metric.type === 'payload_sanitized') {
        stats.payloadsSanitized++;
        addLog(tabId, 'payload_sanitized', `Sanitizado payload JSON eliminando nodo: "${metric.key}"`, 'inject.js');
      } else if (metric.type === 'evasion') {
        addLog(tabId, 'evasion', `Object Shadowing ejecutado de forma transparente para ${metric.api}.${metric.method}`, 'inject.js');
      }
      break;

    case 'GET_CURRENT_STATS':
      sendResponse({ stats: stats, logs: stats.logs });
      break;

    case 'TOGGLE_STATUS':
      stats.isEnabled = request.enabled;
      addLog(tabId, 'info', `Extensión configurada como ${stats.isEnabled ? 'ACTIVA' : 'INACTIVA'} para esta pestaña.`, 'background.js');
      sendResponse({ stats: stats });
      break;

    default:
      break;
  }

  return true;
});

// Limpieza de estadísticas de pestañas cerradas para evitar fugas de memoria
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStats[tabId];
});

console.log('[AddVoid] Service Worker listo y escuchando eventos.');
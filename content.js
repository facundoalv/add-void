(function () {
  'use strict';

  // --- PILAR 3: Ocultamiento Cosmético Inmutable ---
  const COSMETIC_RULES = [
    'div[class*="ad-placement"]',
    'div[class*="video-ads"]',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '.ytp-ad-module',
    '.ytp-ad-image-overlay',
    '.ytp-ad-overlay-container',
    'div[id*="dfp-ad"]',
    '.top-banner-ad-container',
    'iframe[src*="doubleclick.net"]'
  ];

  // Helper seguro para enviar mensajes al Service Worker
  function safeSendMessage(message) {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(message, () => {
          // Capturar lastError para prevenir excepciones no controladas
          if (chrome.runtime.lastError) {
            // Silenciar error si el background está inactivo
          }
        });
      }
    } catch (e) {
      // Manejar contexto de extensión invalidado
    }
  }

  // Inyectar CSS global inmutable
  function injectCosmeticCSS() {
    const target = document.head || document.documentElement;
    if (!target) return;

    let style = document.getElementById('addvoid-cosmetic-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'addvoid-cosmetic-styles';
      style.textContent = COSMETIC_RULES.map(rule => `${rule} { display: none !important; opacity: 0 !important; pointer-events: none !important; height: 0 !important; width: 0 !important; }`).join('\n');
      target.appendChild(style);

      safeSendMessage({
        type: 'COSMETIC_APPLIED',
        count: COSMETIC_RULES.length
      });
    }

    // Observar para re-inyectar si algún script de la página borra el nodo de estilos
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.removedNodes.forEach(node => {
          if (node === style || node.id === 'addvoid-cosmetic-styles') {
            if (!document.getElementById('addvoid-cosmetic-styles')) {
              target.appendChild(style);
              safeSendMessage({
                type: 'LOG_EVENT',
                logType: 'evasion',
                source: 'content.js',
                message: 'Detectado intento de remoción de estilos cosméticos. Re-inyección inmutable activada.'
              });
            }
          }
        });
      }
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  // --- PASAMANOS: Escuchar eventos del MAIN World (inject.js) ---
  window.addEventListener('AddVoid_Event', (event) => {
    const detail = event.detail;
    
    // Reenviar datos al Service Worker (background.js) de la extensión
    safeSendMessage({
      type: 'METRIC_UPDATE',
      metric: detail
    });
  });

  // --- INYECCIÓN TEMPRANA DE INJECT.JS ---
  function injectScriptFile() {
    try {
      const container = document.head || document.documentElement;
      if (!container) return;

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject.js');
      script.onload = function() {
        this.remove(); // Limpieza del nodo DOM
      };
      container.appendChild(script);
      
      safeSendMessage({
        type: 'LOG_EVENT',
        logType: 'info',
        source: 'content.js',
        message: 'Inyectado exitosamente el script de enmascaramiento en el contexto MAIN.'
      });
    } catch (e) {
      console.error('[AddVoid] Error inyectando script:', e);
    }
  }

  // Ejecución segura respetando el ciclo de vida del DOM
  if (document.documentElement) {
    injectScriptFile();
  } else {
    document.addEventListener('DOMContentLoaded', injectScriptFile);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCosmeticCSS);
  } else {
    injectCosmeticCSS();
  }

  // Detección y salto relámpago de anuncios en el DOM de YouTube
function observeYouTubeAds() {
  const observer = new MutationObserver(() => {
    const moviePlayer = document.querySelector('#movie_player');
    const video = document.querySelector('video');

    if (moviePlayer && video) {
      const isAd = moviePlayer.classList.contains('ad-showing') || 
                   moviePlayer.classList.contains('ad-interrupting');

      if (isAd) {
        // Silenciar y saltear instantáneamente
        video.muted = true;
        if (isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
        }

        // Clic automático al botón de omitir
        const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
        if (skipBtn) {
          skipBtn.click();
        }
      }
    }
  });

  const targetNode = document.body;
  if (targetNode) {
    observer.observe(targetNode, { childList: true, subtree: true });
  }
}

observeYouTubeAds();
})();
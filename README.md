# ad-void
Extension basada en Manifest V3 que mitiga ad-scripts mediante inyeccion temprana en MAIN world. Implementa Object Shadowing sobre fetch/XHR, enmascara .toString() para evadir introspeccion V8 y desvía peticiones de red via declarativeNetRequest con respuestas mock 200 OK, eliminando payloads de anuncios sin alterar el DOM de forma detectable.

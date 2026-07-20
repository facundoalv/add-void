/* AddVoid - Mock Response
* 
* Este archivo actúa como un script señuelo (mock). 
* Se inyecta con un estado '200 OK' para interceptar peticiones de anuncios/telemetría.
* Evita excepciones en la consola de la página web y rompe la detección de anti-adblocks.
*/

// Define una propiedad global inofensiva para confirmar la intercepción exitosa
self.__addvoidMocked = true;

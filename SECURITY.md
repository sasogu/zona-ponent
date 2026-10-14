# Seguridad

Este repositorio contiene código y ejemplos. No contiene credenciales de una
instalación real, datos de su servidor ni presentaciones privadas.

## Qué protege cada capa

- StatiCrypt cifra el HTML, incluidas las notas originales y las credenciales
  de cada presentación. La contraseña de acceso debe ser larga y única.
- AES-GCM cifra las anotaciones en el navegador antes de almacenarlas en el relé.
- Los tokens HMAC autentican HTTP y WebSocket; el secreto del relé permanece
  únicamente en la configuración de la instalación y durante la generación.
- HTTPS protege la conexión. El relé recibe las posiciones de las diapositivas,
  los identificadores de canal, las revisiones y el tamaño de los bloques cifrados.
- El servidor sirve exclusivamente `dist/`, comprueba las rutas reales y rechaza
  archivos ocultos y enlaces que escapen de esa carpeta.

## Límites

La contraseña da acceso común: no hay cuentas, roles independientes ni revocación
por dispositivo. Los clientes autorizados pueden avanzar diapositivas y modificar
anotaciones. El navegador conserva las notas en localStorage sin cifrado para
trabajar sin conexión; utiliza dispositivos y perfiles de navegador de confianza.

No hay un borrado garantizado de las notas originales de la memoria o del DOM del
proyector después de descifrar: el modo proyector las oculta visualmente. Quien
tenga acceso a esa sesión puede inspeccionarlas. No abras páginas de otros autores
con código activo que no hayas revisado: las presentaciones ejecutan JavaScript.

La contraseña protege frente a una lectura casual del contenido, pero un HTML
cifrado descargado permite intentos de descifrado fuera de línea. La fuerza de la
contraseña importa. Perder o cambiar las claves puede impedir recuperar las
anotaciones anteriores; no hay migración automática ni servicio de recuperación.

Esta versión no añade límites globales de peticiones HTTP por IP. En un servicio
expuesto a Internet, configura límites de acceso y tamaño de petición en el proxy.
Los WebSocket tienen límites de conexiones, mensajes y actividad por canal.

## Qué debe permanecer privado

`.env`, `.staticrypt.json`, `presentaciones.json`, las fuentes de `private/`,
`dist/`, `data/`, copias de seguridad y configuración de cada servidor.
El patrón de permisos es `0600` para credenciales y estado y `0700` para su carpeta.
No incluyas tokens en URLs, capturas, informes ni incidencias.

## Informar de un problema

Usa **Security → Report a vulnerability** en GitHub si está disponible. No publiques
credenciales ni datos reales en una incidencia. Incluye una reproducción con
configuración y presentaciones ficticias.

# Despliegue de una instalación propia

Las plantillas de `deploy/` usan `example.com`, un usuario de servicio genérico
y rutas nuevas. Sustituye esos valores por los de tu instalación. No proceden de
ningún servidor de producción.

## Preparar el sitio

Instala Node.js 20.6 o superior y Python 3.10 o superior, clona el repositorio y
ejecuta los pasos del README. Genera `dist/` en un equipo de confianza. Conserva
una copia privada del manifiesto, las fuentes y las credenciales.

En el servidor instala el código y las dependencias con `npm ci --omit=dev` bajo
`/opt/zona-ponent`, y copia la salida cifrada a `/opt/zona-ponent/dist`.
No sirvas la raíz del repositorio con nginx; el servidor Node solo sirve `dist/`.

Crea un usuario de servicio `ponente` y su carpeta de datos. La configuración
privada se guarda en `/etc/zona-ponent/environment`, propietario root y permisos
`0600`. Incluye `SYNC_AUTH_SECRET` con el mismo valor generado en tu instalación,
`ALLOWED_ORIGINS=https://example.com`, `HOST=127.0.0.1`, `PORT=8110` y
`DATA_DIR=/var/lib/zona-ponent`. La contraseña de las páginas se necesita para
generarlas, no para arrancar el relé.

La unidad de ejemplo usa `EnvironmentFile`; no necesita copiar `.env` junto a los
archivos públicos. Cada instalación debe tener credenciales nuevas. No reutilices
las de otro despliegue.

## HTTPS y mismo origen

Instala el servicio systemd y configura nginx usando las plantillas. Obtén un
certificado TLS para tu dominio según el procedimiento de tu proveedor.
La configuración del ejemplo presupone que ya existe ese certificado.

Todo el sitio y `/sync/` pasan al mismo proceso Node. `/sync/` conserva el path
original y permite la actualización a WebSocket. El dominio debe coincidir
exactamente con `ALLOWED_ORIGINS`; si necesitas otro alias, añade también su origen.

WebCrypto requiere HTTPS cuando accedes desde otro dispositivo. HTTP en una IP de
la red local no basta aunque estés conectado a una VPN. `localhost` permite la
prueba local del README.

El script genera `dist/` inicialmente con permisos privados. Para el servicio,
asigna los archivos a `root:ponente`, directorios `0750` y archivos `0640`; el
usuario `ponente` necesita leer la salida y las dependencias, pero solo escribir
en su directorio de datos. No hagas accesibles al servicio tus fuentes privadas.

## Actualizar y verificar

Regenera y reemplaza `dist/` cuando cambies presentaciones o el cliente. Al
actualizar el servidor, ejecuta `npm ci --omit=dev` y reinicia el servicio.
Conserva las credenciales, la sal y `/var/lib/zona-ponent`.

Comprueba `/sync/health`, abre mando y proyector en dispositivos distintos,
avanza una diapositiva y añade una nota ficticia. Abre un segundo mando y verifica
que recupera esa nota y que la nube indica «Sincronizado».

La carpeta del servidor nunca debe sincronizarse con este repositorio público.
Configura backups privados, límites de acceso y tamaños de petición adecuados.

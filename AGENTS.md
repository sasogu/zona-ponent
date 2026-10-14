# Trabajo en este repositorio

El README debe mantenerse en valencià, por petición del usuario. Conserva las
órdenes, rutas y etiquetas reales de la interfaz al traducirlo. El resto de la
documentación y las comunicaciones del proyecto se mantienen en castellano.
El cliente es HTML/CSS/JavaScript sin framework. El relé usa Node.js y ws;
la generación de páginas y las pruebas de navegador usan Python.

Este repositorio es público. No añadir credenciales, direcciones de servidores
reales, fuentes privadas, salida cifrada de instalaciones ni datos de usuarios.
Las demos y las pruebas deben utilizar exclusivamente contenido ficticio.
No imprimir contraseñas, tokens ni contenido de archivos privados al depurar.

Comandos: `npm ci`, `npm test`, `npm run test:browser`. Antes de un commit,
prepara solo archivos públicos y ejecuta `npm run check:public` y
`git diff --cached --check`. No ignorar resultados de la revisión de privacidad.

Al cambiar la distribución del mando, verificar con Reveal.js real y en WebKit,
además de comprobar persistencia, giro y gestos táctiles. Los eventos de Reveal
pueden burbujear hasta window: no confundir su evento resize con un cambio del
viewport.

No convertir este repositorio en un despliegue concreto. Las configuraciones
particulares deben permanecer fuera de Git y los ejemplos usar dominios reservados.

Las capturas para el README deben proceder de la demo ficticia. Revisarlas
visualmente antes de publicarlas y registrar sus huellas SHA-256 en base64 en
docs/images/revisades.json. La revisión pública admite únicamente las imágenes
PNG que coincidan con esas huellas; una imagen modificada requiere nueva revisión.

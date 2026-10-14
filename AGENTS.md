# Trabajo en este repositorio

Mantén la documentación y las comunicaciones del proyecto en castellano.
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

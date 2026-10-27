# Workspace Generator

Herramienta local para crear en segundos una estructura inicial de carpetas y recursos para una tarea o proyecto.

## Ejecutar

Requisitos: Node.js 20 o superior (incluye npm) y Chrome o Edge de escritorio actualizado. Abre una terminal dentro de la carpeta raíz del repositorio, donde está `package.json`.

```bash
npm install
npm start
```

**Paso 1:** `npm install` prepara el proyecto. **Paso 2:** `npm start` inicia la aplicación y su API.

Cuando la terminal muestre `Workspace Generator disponible en http://localhost:4173`, abre esa dirección en Chrome o Edge. Mantén la terminal abierta; para detener el servidor, pulsa `Ctrl+C`. El proyecto no necesita base de datos, variables de entorno ni paquetes externos.

Para desarrollo con reinicio automático del servidor, puedes sustituir el segundo comando por `npm run dev`. Si el puerto 4173 está ocupado, cierra la instancia anterior antes de iniciar otra.

## Uso

1. Selecciona la carpeta local de destino.
2. Escribe el nombre, el autor y elige una o más plantillas.
3. Pulsa **Crear estructura**. Si el proyecto ya existe, elige cancelar, cambiar el nombre o sobrescribir los archivos gestionados.

La app muestra eventos y rutas relativas. Al sobrescribir, actualiza solo las rutas de las plantillas elegidas y conserva los demás archivos.

## Características

- **Imágenes:** genera `images/placeholder.svg`.
- **Documentos:** genera `docs/README.md` con fecha, autor, descripción breve y checklist.
- **Configuración:** genera `config.json` con nombre, autor, fecha ISO, versión y plantillas seleccionadas.
- Valida nombres vacíos, caracteres prohibidos, nombres reservados y rutas inválidas.
- Registra creación, advertencias y errores durante el proceso.
- Conserva hasta 200 eventos en la pestaña mediante sessionStorage, incluso tras recargar. Crear otro proyecto conserva el historial; el botón Limpiar lo vacía. Los permisos de carpeta se vuelven a solicitar tras una recarga.

## Arquitectura

- `public/`: interfaz HTML, estilos CSS y lógica del navegador.
- `server/index.js`: servidor HTTP de Node.js y endpoints locales.
- `server/validation.js`: validación del nombre y generación del manifiesto de archivos.
- `public/file-system.js`: permisos, acceso a carpetas y escritura de los archivos gestionados.

El backend HTTP nativo de Node.js valida la solicitud y prepara el manifiesto de contenido. La escritura ocurre en el navegador con **File System Access API**, después de que el usuario selecciona el destino y concede permiso. El servidor no recibe el manejador de carpeta ni la ruta absoluta: el navegador no ofrece esa información a la página. Solo se muestra el nombre de la carpeta y las rutas relativas.

## Decisión de liderazgo

Ante una baja adopción, primero conversaría con las dos personas para entender el costo real del flujo y observar cómo hacen hoy la tarea. Probaría con ellas una versión más rápida, mediría tiempo y errores antes y después, e incorporaría su feedback. Compartiría resultados con el equipo y dejaría que la mejora del proceso impulse la adopción, sin imponer la herramienta.

El enunciado menciona dos escenarios, pero el PDF solo presenta el escenario A. No se inventa una respuesta para un escenario ausente.

## Demo de 15 minutos

1. **0–2 min:** explicar el problema y arrancar con los dos comandos anteriores.
2. **2–6 min:** elegir una carpeta de prueba, introducir nombre y autor y generar las tres plantillas.
3. **6–9 min:** mostrar archivos, metadatos, progreso y registro persistente.
4. **9–12 min:** repetir el nombre, mostrar cancelar/cambiar nombre/sobrescribir y una entrada inválida.
5. **12–15 min:** ejecutar `npm test`, resumir arquitectura y límites y responder el escenario de adopción.

Para la defensa técnica, preparar las razones para usar Node sin dependencias, la diferencia entre validación de API y permisos del navegador, la ausencia de rutas absolutas y el manejo de fallos parciales.

## Comprobaciones de seguridad

Ejecuta `npm test`. Las pruebas cubren entradas malformadas, rutas no permitidas, escape de contenido, límites de solicitudes, validación de manifiestos y solicitudes de otros sitios.

El servidor solo escucha en loopback, comprueba Host y Origin, limita el cuerpo JSON a 32 KiB y sirve una lista explícita de archivos públicos. La interfaz comprueba las rutas del manifiesto antes de escribir y bloquea cambios del formulario durante la operación.

Las escrituras no son una transacción completa: un fallo puede dejar archivos parciales. Evita modificar simultáneamente la misma carpeta desde otra aplicación; la API del navegador no proporciona creación exclusiva de directorios.

## Diseño y rendimiento

Inter variable (400–600) se sirve localmente en WOFF2, con licencia en `public/fonts/OFL.txt`. Se usa el subconjunto latino de 48.256 bytes y `font-display: swap`. No se consultan servicios de fuentes ni librerías de iconos al utilizar la app.

Medición de contenido HTTP con Gzip: carga inicial de aproximadamente 61,5 KB (HTML, CSS, JS, fuente y health; sin contar cabeceras). HTML/CSS/JS pasan de 46,5 KB a 13,2 KB, aproximadamente 72% menos. La fuente tiene caché de 24 horas; los recursos de texto usan ETag y respuestas 304. Estos valores describen transferencia, no una puntuación de Lighthouse.

Diseño revisado en Chrome a 320, 375, 768, 1024 y 1440 px: sin desbordamiento horizontal de página ni controles fuera de pantalla. La emulación responsive no sustituye pruebas en dispositivos físicos. La selección de carpetas requiere Chrome o Edge de escritorio compatible; el diseño móvil permite consultar la interfaz.

## Limitaciones

- La escritura local requiere una versión compatible de Chrome o Edge de escritorio y permiso explícito del usuario.
- El backend debe estar en ejecución para validar y preparar las plantillas.
- La API no expone la ruta absoluta local; el navegador administra el acceso concedido.

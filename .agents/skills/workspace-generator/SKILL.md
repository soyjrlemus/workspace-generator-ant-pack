---
name: workspace-generator
description: Construye o revisa el generador local de carpetas y recursos para la prueba Web Tech Lead de ANT Pack. Úsala para implementar o preparar la demo descrita en el PDF.
---

# Workspace Generator

Implementa una aplicación local que cree estructuras de proyectos elegidas por el usuario. Prioriza una demo funcional y mantenible, con dependencias mínimas.

## Requisitos

- Frontend semántico y responsive con HTML, CSS y JavaScript.
- Si el usuario pide frontend y backend, crea una API local con Node.js (Express si ya está disponible; HTTP nativo si se necesita evitar una descarga). La API valida entradas y produce el manifiesto. Usa `showDirectoryPicker()` en el navegador para seleccionar y escribir en la carpeta local: el permiso y el manejador no se transfieren al servidor.
- No expongas ni inventes rutas absolutas del sistema; muestra el nombre de la carpeta elegida y rutas relativas.
- Permite elegir plantillas: `images/placeholder.svg`, `docs/README.md` (fecha, autor, descripción y checklist) y `config.json` (nombre, autor, fecha ISO, versión y plantillas).
- Valida nombre vacío, espacios iniciales/finales, caracteres prohibidos, nombres reservados y traversal. Requiere al menos una plantilla.
- Ante una colisión, ofrece cancelar, cambiar nombre o sobrescribir. Sobrescribe solo archivos gestionados por la app y conserva los demás.
- Registra en tiempo real rutas relativas, hora y estado. Explica errores de compatibilidad, cancelación, permisos y escritura sin filtrar detalles innecesarios.
- El progreso debe reflejar operaciones reales. No borres carpetas completas.
- Documenta instalación, ejecución en 1–2 pasos y el flujo de demo en README.

## Criterio de entrega

Deja el código y README en un repositorio GitHub o GitLab. Excluye salidas de QA y documentación privada del proceso. El README debe indicar los dos comandos exactos de arranque desde la raíz, prerrequisitos y URL local. Prepara una demo de 15 minutos y la defensa de arquitectura de 30 minutos. Comunica el tiempo real dedicado al entregar; no lo inventes.

Confirma en Chromium local que se puede elegir destino, crear las plantillas y ver el resultado; comprueba también validación, colisión y errores recuperables. Si el entorno bloquea el acceso al servidor local, verifica lo posible por separado e indica la limitación. No afirmes verificaciones que no se ejecutaron.

El PDF menciona dos escenarios de liderazgo, pero solo incluye el escenario A sobre adopción. Respóndelo con empatía, medición y mejora continua; señala la inconsistencia y no inventes el escenario B.

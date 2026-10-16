# Validación de QuéComemos 0.1.0

## Resultado

Validación realizada el **16 de octubre de 2026** en Windows 11 Pro de 64 bits. La lógica de dominio y los flujos principales del navegador pasan las pruebas automatizadas. **La generación RAG real no se considera superada**: el modelo llega a iniciar en la GPU, pero WebLLM/XGrammar falla al muestrear la respuesta JSON, tanto con conexión como en la ejecución sin conexión. El generador de menús permanece bloqueado hasta resolver esa incompatibilidad.

No se publican métricas de generación ni se equiparan las pruebas con controlador simulado a inferencia real.

## Entorno observado

| Componente | Resultado |
| --- | --- |
| Node.js portátil | 24.22.0 |
| Chrome | 155.0.8059.41 |
| Microsoft Edge | 155.0.4283.45 |
| WebGPU | Adaptador Intel, arquitectura `gen-12lp`, `shader-f16` disponible; adaptador no fallback |
| GPU detectada por Windows | Intel(R) UHD Graphics 770, controlador 31.0.101.4274 |
| PDF.js | 6.4.299, distribuido localmente |
| WebLLM | 0.2.86, distribuido localmente |
| Modelo | Qwen2.5-0.5B-Instruct-q4f16_1-MLC, revisión `32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad`, Apache-2.0 |
| Archivos de pesos | 14 archivos, 289.588.385 bytes (276,2 MiB); todos alcanzaron la fase de verificación/carga desde caché |

## Pruebas automatizadas

Comandos ejecutados con el Node.js portátil incluido en el entorno de desarrollo:

```powershell
.\.tools\node-v24.22.0-win-x64\node.exe --test .\tests\domain.test.mjs .\tests\rag.test.mjs
.\.tools\node-v24.22.0-win-x64\node.exe .\node_modules\playwright\cli.js test
```

| Grupo | Resultado | Cobertura observada |
| --- | --- | --- |
| Dominio y RAG | 51/51 aprobadas | Esquemas, fechas, referencias, cantidades, compras, restricciones, frecuencia, recuperación BM25, citas y abstenciones |
| Navegador Chrome | 12/12 aprobadas | Importación/restauración, persistencia, catálogo, teclado, ingestión, CORS, modo sin WebGPU y PWA offline |
| Navegador Edge | 12/12 aprobadas | Mismos flujos de navegador |
| Chrome móvil, viewport 390 × 844 | 12/12 aprobadas | Mismos flujos y navegación responsive |
| Total navegador | 36/36 aprobadas | 3 proyectos, sin fallos |
| Copia extraída del ZIP | 36/36 aprobadas | Suite completa ejecutada contra el directorio extraído en `http://127.0.0.1:18081` |

Las capturas reales generadas por la prueba offline se conservan en `docs/screenshots/`.

El empaquetado generó ambos entregables, incluyó el JSON dentro del ZIP y comparó su SHA-256 con la copia fuente. La suite de navegador anterior se ejecutó sirviendo directamente la copia extraída, no solo el árbol de desarrollo.

## Criterios funcionales

| Criterio | Evidencia y resultado |
| --- | --- |
| JSON válido/corrupto y restauración | Aprobado: se rechazan JSON inválidos antes de persistir; la restauración de una copia válida mantiene los datos tras recargar. |
| Demostración | Aprobado: esquema válido, cuatro perfiles ficticios (dos adultos, edades 6 y 10), 30 fechas y exactamente 60 entradas de comida/cena, con recetas y evidencias resueltas. La importación es voluntaria. |
| Persistencia | Aprobado en navegador: familia, menú y marcas sobreviven a la recarga. |
| Escalado y suma | Aprobado: 200 g para 2 raciones pasan a 400 g para 4; 400 g + 250 g de la misma unidad/estado suman 650 g. Unidades y estados incompatibles no se fusionan. |
| Alergias | Aprobado en lógica: huevo y derivados conocidos se excluyen; compatibilidad desconocida no se afirma y las restricciones desconocidas no se relajan. |
| Edad y porciones | Aprobado: cambiar la edad no modifica porciones manuales ni crea factores automáticos. |
| Corpus vacío/incompatibilidad | Aprobado en lógica: se rechaza la generación antes de inferencia y se informa la falta de candidatos o evidencias. |
| 10 consultas de recuperación | BM25 recuperó la receta esperada en 10/10 consultas de catálogo; la validación de cita propia pasó 10/10 casos. Son pruebas deterministas del recuperador/validador, no salidas del LLM. |
| Evidencias y citas | Aprobado en pruebas deterministas: se rechazan IDs inventados, citas cruzadas, no recuperadas o sin evidencia propia, así como justificaciones no comprobables. |
| CORS y archivos | Aprobado en navegador: la importación por URL bloqueada ofrece la vía manual; TXT/Markdown no se convierten en recetas y los PDF sin texto solicitan OCR. |
| Sin WebGPU | Aprobado con WebGPU ausente en el navegador de prueba: se mantienen disponibles recetas y menús y se informa la limitación. |
| Navegación accesible | Aprobada la secuencia de teclado probada, incluido abrir una receta y cerrar el diálogo. No se ejecutó una auditoría completa WCAG automatizada. |
| PWA offline | Aprobado para el shell/datos: el Service Worker permite recargar sin red y conservar la demostración en los tres proyectos. Esto no demuestra generación IA offline. |

## Prueba de inferencia real y bloqueo

Se ejecutó `scripts/probe-browser.mjs`: Chrome y Edge expusieron WebGPU con adaptador Intel no fallback y soporte `shader-f16`. A continuación se ejecutó `scripts/verify-model.mjs`, que descarga los pesos solo para esta prueba explícita, verifica tamaños y SHA-256 y carga el Worker con acceso limitado a la caché.

| Sesión | Resultado |
| --- | --- |
| Online, Chrome + WebGPU | Los archivos del modelo se verificaron y el motor llegó a la primera inferencia; falló la generación JSON con `Grammar matcher rejected the newly sampled token.` |
| Offline, sesión nueva del perfil persistente con red deshabilitada | La app/modelo se inició desde los recursos cacheados y alcanzó la misma primera inferencia; falló con el mismo error. La generación offline no queda certificada. |
| Menú generado por el modelo | Pendiente/no superado: no hubo selección real, cita generada ni validación final completada. |
| Cancelación de inferencia real | Pendiente: el error de gramática impidió completar una inferencia normal y comprobar su cancelación. |

El script conserva el informe reproducible en `test-results/model-results.json` y devuelve código distinto de cero cuando la generación o la sesión offline falla. La disponibilidad de WebGPU por sí sola no se presenta como prueba de RAG. El modo de consulta sin IA tampoco cuenta como RAG superado.

## Límites y próximos pasos

- Resolver la incompatibilidad de generación estructurada con la combinación fijada de WebLLM, XGrammar, modelo y entorno; repetir el smoke test y la generación de un menú con las 10 evidencias.
- Solo después de una generación real satisfactoria, comprobar cancelación, reinicio frío completamente sin red y ausencia de peticiones externas.
- Repetir la prueba en otros controladores/navegadores antes de atribuir el fallo a la GPU Intel o a una versión concreta del runtime.
- No se certifica suficiencia nutricional, ausencia de trazas, resultados clínicos ni compatibilidad de alérgenos no documentada.

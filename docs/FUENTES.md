# Fuentes, atribución y límites del catálogo

Consulta y comprobación de enlaces: **16 de octubre de 2026**. El catálogo incluye 15 recetas de páginas individuales de Canal Salut, con cantidades y raciones documentadas. Sus pasos son traducciones y síntesis al español realizadas para QuéComemos. La familia y el calendario de noviembre de 2026 son ficticios; las recetas tienen procedencia real.

## Los cuatro enlaces originales

| Referencia | Comprobación y versión | Reutilización aplicada |
| --- | --- | --- |
| [AESAN: recomendaciones dietéticas](https://www.aesan.gob.es/nutricion/recomendaciones-dieteticas) | Página accesible. Guía enlazada: diciembre de 2022, 19 páginas. | Enlace y breve síntesis atribuida; PDF e imágenes excluidos. |
| [Guía de alimentación en etapa escolar](https://salutpublica.gencat.cat/web/.content/minisite/aspcat/promocio_salut/alimentacio_saludable/02Publicacions/pub_alim_inf/guia_alimentacio_saludable_etapa_escolar/guia_alimentacion_etapa_escolar.pdf) | PDF accesible, edición en español de junio de 2020, 86 páginas. | Referencia de descarga y paráfrasis breve. No se redistribuye el PDF; contiene fotografías Thinkstock. |
| [Canal Salut: recetas saludables](https://canalsalut.gencat.cat/ca/vida-saludable/alimentacio/receptes-saludables/) | Índice accesible, sin versión editorial única. | Selección individual según el aviso legal, con atribución y fecha. |
| [Familia y Salud: 100 recetas](https://www.familiaysalud.es/sites/default/files/100_recetas_saludables_para_disfrutar_en_familia_fys_compr_1_1.pdf) | PDF accesible, 113 páginas; fecha y versión no verificables en el enlace. Complemento sanitario ajeno a la administración pública. | Solo enlace. No se presupone licencia abierta ni se redistribuyen páginas, imágenes o recetas. |

El [aviso legal de la Generalitat](https://web.gencat.cat/ca/avis-legal), revisado en la misma fecha, autoriza reutilización y adaptación de información pública con condiciones, entre ellas atribución y fecha; una licencia específica prevalece. Se revisaron los textos de las 15 páginas seleccionadas y no se detectó licencia específica ni crédito textual de terceros. Se excluyeron del catálogo el hummus adaptado de Vegetarianismo y la tortilla cedida por Cuinatur. No se incluyen fotografías, logotipos, marcas ni diseño de la Generalitat.

## Registro de recetas

Todas indican cuatro personas en la fuente. Fecha es la última actualización visible de cada página, conservada en el JSON y en `source-audit.json`.

| Receta | Última actualización | Fuente individual |
| --- | --- | --- |
| Crema de lentejas rojas, zanahoria y cilantro | 31/05/2021 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Crema-de-llenties-vermelles-pastanaga-i-coriandre) |
| Paté de lentejas y nueces | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Fals_pate_de_llenties_i_nous) |
| Crema de alubias blancas, calabaza y romero | 22/02/2021 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Crema-de-mongetes-blanques-carbassa-i-romani) |
| Garbanzos con curry y calabaza | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Cigrons_amb_curri) |
| Estofado de verduras con tofu | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Estofat_de_verdures_amb_tofu) |
| Sopa de lentejas con mostaza | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Sopa_de_llenties_amb_mostassa) |
| Hamburguesas de alubias rojas | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Hamburgueses_de_mongetes_vermelles) |
| Huevos al plato con guisantes | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Ous_al_plat_amb_pesols) |
| Lentejas con arroz y setas | 04/08/2025 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/Llenties-amb-arros-i-bolets) |
| Arroz con alcachofas y setas | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/arros-carxofes-bolets) |
| Arroz integral con verduras | 26/09/2023 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/arros-integral-verdures) |
| Crema de coliflor, brócoli y almendras | 17/12/2025 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/crema-coliflor-broquil-ametlles) |
| Espirales con calabacín y albahaca | 26/09/2019 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/espirals-carbasso-alfabrega) |
| Lubina al horno con hinojo y limón | 17/07/2019 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/llobarro-forn-aroma-fonoll-llimona) |
| Pollo con samfaina | 03/08/2015 | [Canal Salut](https://canalsalut.gencat.cat/ca/detalls/article/pollastre-samfaina) |

## Cantidades y clasificación

`originalQuantityText` conserva lo publicado: rangos como «25–30 g», «una copa», «un manojo» o «al gusto». Cuando no hay cantidad unívoca en las cinco unidades admitidas, `quantity` es `null`; no se elige un valor del rango ni se convierte una copa a mililitros sin datos. Se aceptan `g`, `ml`, `unidad`, `cucharada` y `cucharadita`. Los archivos en kg o litros deben convertir explícitamente a g o ml antes de importarse; el validador rechaza unidades no canónicas. Litros publicados se convierten exactamente a ml (1 l = 1000 ml), sin conversiones de densidad.

`minutes` es `null` cuando la fuente da tiempos parciales, sin un tiempo total verificable. Los pasos conservan los tiempos parciales. Los ingredientes crudos/secos, cocidos y frescos se suman por separado. Una cucharadita de café y una cucharada sopera se conservan como categorías de unidad, sin asignar masa ni volumen.

Los alérgenos son clasificación editorial según ingredientes, no declaraciones analíticas de la fuente. Caldos, curry, salsas, pasta y otros productos cuya composición completa depende de etiqueta se marcan desconocidos; con alergias o intolerancias estas recetas se excluyen. «Conocido» indica ingredientes identificados y nunca certifica ausencia de trazas. La detección incluye huevo, clara, yema, albúmina, ovoalbúmina, ovomucoide, lisozima/E-1105, mayonesa y merengue incluso si un JSON omite declararlos.

## Referencias de variedad y frecuencia

La aplicación cuenta **platos con un grupo**, sin convertir esa presencia en raciones nutricionales. Sustituye el plato doméstico por los grupos de la comida fuera para cada miembro implicado; avisa si faltan datos. La advertencia por cuatro o más entradas con solo una o dos preparaciones es un criterio funcional de variedad de QuéComemos, sin atribuirlo a una autoridad sanitaria.

Las referencias se registran con población, edición y fragmento. Para adultos se muestran las frecuencias de [AESAN, diciembre de 2022](https://www.aesan.gob.es/dam/jcr:303bc425-0df3-4124-abe9-75499ce573fa/RECOMENDACIONES_DIETETICAS.pdf), páginas impresas 6, 8, 9 y 10. Para escolares se muestra separadamente la referencia de la guía escolar de junio de 2020, página impresa 12. No se comparan automáticamente apariciones con raciones ni se extrapolan objetivos de adultos a niños. No se afirma que una semana cumple una dieta completa.

Las ideas de desayuno y media mañana remiten a la guía escolar de 2020, páginas impresas 15 y 17. Se filtran por restricciones y se presentan como ideas sin cantidades documentadas, no como recetas del catálogo. Los números de página del JSON son los impresos; en el visor PDF pueden diferir en una página por la portada.

`data/build-data.mjs` permite regenerar el catálogo y la demostración con la herramienta de desarrollo opcional Node. El usuario final usa los JSON preparados. `schemas/` documenta los contratos; `validateBundle` añade las restricciones entre documentos, referencias, IDs, fechas reales y las 60 entradas de noviembre de 2026 antes de escribir IndexedDB.

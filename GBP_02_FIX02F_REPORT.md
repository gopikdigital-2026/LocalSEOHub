# GBP-02-FIX02F — Informe (reconstrucción documental FIX02F-RECOVERY)

**Fecha:** 2026-11-25
**Alcance:** actualización controlada de 13 hashes SHA-256 obsoletos en el guardián Meta
`src/features/meta-connection/__tests__/a351MetaConnection.test.ts`
(bloque `A3.5.1 · P. GBP regression: frozen files`).

**Naturaleza de este documento:** reconstrucción documental. Los informes, evidencias y ZIP originales de FIX02F
desaparecieron tras una resincronización del proyecto, pero el cambio de código se conservó. Esta entrega
**no modifica código**: verifica el estado actual frente a FIX02E, vuelve a ejecutar las validaciones y regenera
los entregables.

## 1. Veredicto

| Comprobación | Resultado |
|---|---|
| Únicas diferencias del guardián frente a FIX02E | 13 valores SHA-256 autorizados, sin otras líneas cambiadas |
| 13 hashes nuevos = SHA-256 real | 13/13 |
| 20 entradas protegidas = SHA-256 real | 20/20 |
| Guardián Meta | 100/100 |
| Compatibilidad GBP (reality-engine) | 231/231 (7 archivos) |
| Suite completa | 3336/3336 (100 archivos) |
| TypeScript | 20 errores (igual que la referencia, preexistentes) |
| Lint | 47 errores y 10 avisos (igual que la referencia, preexistentes) |
| Build | OK |

**Estado: CONFORME. Detenido para auditoría.**

## 2. Identidad del guardián

| | SHA-256 |
|---|---|
| Antes (FIX02E, `deliverables/localseohub-gbp02-fix02e.zip`) | `07c224a828c6128c951fd0e227ea335117ccae53b23a8a1b3be7ee587b673d81` |
| Después (estado actual del proyecto) | `dd64157c96f5b3eb59336a26d2d3f37d57f13a7e2f9918c1afb7e3336a6fff78` |
| Diff unificado (`guardian-test.diff`, 39 líneas) | `ee2b455d5f93c7747b8cd500a6b1778dcf62a99845f3651ef23cdd536c2f36a7` |

La comparación se hizo línea a línea. Solo cambian las 13 líneas `'<ruta>': '<sha256>'` de la tabla de
abajo. No cambian los nombres de prueba, las aserciones, las entradas añadidas o eliminadas ni ninguna otra línea.

## 3. Los 13 hashes actualizados

| Origen | Archivo | Hash antiguo | Hash nuevo (= real) |
|---|---|---|---|
| FIX02B | supabase/functions/gbp-oauth-start/handler.ts | `991438435abdc920e98fdf830215ed63227d8d2ce697c0ff6c3220bb260130b8` | `81d01feaa42c8e01f1989b96e53780a3cc8ca0930d9bf38cd7f36ef203e4d933` |
| FIX02B | supabase/functions/gbp-oauth-start/index.ts | `8cb979ce494a8ec281ec3b1035b0fa364853baf796b96a0e632ac413eb573464` | `186e6257e675dd17e598bd7215043ad2155dd0163c9b1438cfd20c9046b288a2` |
| FIX02B | supabase/functions/gbp-disconnect/handler.ts | `45c1acbed37364c434b9369452d93282a809699b4a7d17bcd5fa535e35b0cf83` | `e2064c2b75165c6b521cb94f523c974b81ed913cdeb83eb12a6571fb477e2f28` |
| FIX02B | supabase/functions/gbp-disconnect/index.ts | `7b28648afd40074e65a9db6d48fb417394981965ecf827edde829d507b9da948` | `457b0734e0499d3703dd78c18dcca4c1802552fcea64d0049850748257f85d55` |
| FIX02B | supabase/functions/gbp-sync/handler.ts | `d71f8fde10b30e44eace976982301fc01bab3898974577cf30f612b341d7673a` | `915bedc7baa97f87a00c0b675ff7c86949f202554c067cee4ef8b2534c4aef84` |
| FIX02B | supabase/functions/gbp-sync/index.ts | `fee680186b7550eeaf7903185f0a8ad6fc7866b65ff71f1ef1aa1ed9d4209ddf` | `748b7aba58828c8b481d3c2dff8f54d878cbc00bca112c38933c9a77177f8ac6` |
| FIX02B | supabase/functions/gbp-reviews/handler.ts | `415883be71ce38ffe72f44051f834af565babb7e27be1cc5afdc8f6ed4adfe3e` | `61e667d0f82a4e218f7a6652cb2672c2cdf553e93a167dd45992b20b25a2a16f` |
| FIX02B | supabase/functions/gbp-reviews/index.ts | `19222fb038e8f115f6aba173d96510986b9ea0744e614dd890bfecf6699792ac` | `3e72f0ada835dbd464abe5ab9cd9262881f3b4c1f7880efc04b81cfa76ef5432` |
| FIX02C | supabase/functions/gbp-recover-attempt/handler.ts | `879ec241a3605e9aa2355a92166f864f3206391c3ac7ffb5cb4111ce1b5cb660` | `8467fa461754a1c8ea8e317112adbf1cb3ea17b3893a1ba6309f42ac4cb15437` |
| FIX02C | supabase/functions/gbp-recover-attempt/index.ts | `0126d8d56316b163295ee48cd2e43dcae495323f4b7444695a1e49f573b69461` | `3a0d378b6f71478b1c4c49dcb52aceced12b022ac2e10c97478b9f55e7f9b162` |
| FIX02C | supabase/functions/gbp-list-locations/handler.ts | `222a8836ca24a5f4a7362d67ff36a78ed4789afde1a37e88fb2fa84743af5fc5` | `eb137ce7d5160c127a2f9b622d16f0c2eb3eaf714ca6b93c5ca1a718bbf7c543` |
| FIX02C | supabase/functions/gbp-list-locations/index.ts | `20bc1c331614524766b5c578db31ee7049d3f9db1693af4803488a14c8bc1913` | `cbdc2d077463d88f9140ac5b1c1db84b9c4e3c2e998587aeef5ea032ab2a7782` |
| FIX02C | src/features/reality-engine/engine.ts | `46205263e3a5216b8e2e8d4c454a8af74da95398e78ea260392491e48a91ce20` | `0d1ac39b768bbe6a13e5699aa759c656a1a142f641208bd0615b53b1b381c7cb` |

Ningún hash antiguo coincide con el archivo actual, lo que confirma que estaban obsoletos. Los 13 nuevos
coinciden con el SHA-256 real. Las 7 entradas no tocadas (gbp-oauth-callback handler/index, GBPCallbackPage,
gbpStatus, SourceCard, registry, sourceStatus) también coinciden.

## 4. Qué no se ha hecho

- No se ha modificado ningún archivo de código, test, guardián, configuración ni migración.
- Sin migraciones, RLS, despliegues, publicaciones ni llamadas externas reales, incluidas las de Google.
- No se ha iniciado FIX03.
- Los errores de TypeScript y lint son preexistentes, coinciden exactamente con la referencia y no se han tocado.

## 5. Método de trabajo

Los scripts y las evidencias se generaron en una carpeta temporal y solo se conservan **dentro del ZIP**, en
`auditoria-a2/gbp02-fix02f/`. La carpeta temporal se eliminó para que en el proyecto solo queden los tres
entregables solicitados.

## 6. Persistencia

Se verificó la presencia de los tres entregables al terminar la generación. **No se puede garantizar que
persistan tras futuras resincronizaciones o restauraciones del proyecto.** Se recomienda descargar el ZIP.

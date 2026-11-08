# Officina XR (versione web)

Apri **https://flalessio21-hue.github.io/officina-xr-/** nel **browser del Meta Quest 3**.

Un laboratorio privato: scrivania vera da afferrare e spostare con le mani, un'assistente a forma di bolla liquida che ti parla
e ti ascolta, oggetti da creare e smontare, e la **scansione automatica** degli oggetti veri che prendi in mano
(in realtà mista).

## Primi passi

1. **🎤 Attiva voce e microfono** (la prima volta scarica circa 200 MB, poi resta nel visore).
2. **Chiave di Claude** (facoltativa): solo per creare a voce oggetti che non sono nel catalogo.

In VR tieni premuto **A** (o X) e parla. In **realtà mista** prendi un oggetto vero, tienilo davanti agli occhi,
di' «scansiona» e giralo piano (i puntini verdi sono ciò che vede); poi di' «fatto»: il sensore di profondità del Quest 3 lo scansiona in 3D (senza chiavi) e la copia compare sulla scrivania.

In **realtà mista** appoggia le mani aperte sul tuo tavolo vero per un secondo: diventa la scrivania (gli oggetti ci si appoggiano sopra).

Il codice completo (anche l'app nativa per il Quest) è nel repository privato `metaquest`.

## Crediti

- `@anthropic-ai/sdk` (Apache 2.0), transformers.js e ONNX Runtime (MIT), in `src/vendor/`.
- Voci: Piper «Paola» it-IT (rhasspy, dati CC0) e «Miro» it-IT (OpenVoiceOS, CC BY-NC-ND 4.0); espeak-ng (GPL-3.0) via jsDelivr.

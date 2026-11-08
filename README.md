# Officina XR (versione web)

Apri **https://flalessio21-hue.github.io/officina-xr-/** nel **browser del Meta Quest 3**.

Un laboratorio privato: scrivania vera da afferrare e spostare con le mani, un'assistente olografica che ti parla
e ti ascolta, oggetti da creare e smontare, e la **scansione automatica** degli oggetti veri che prendi in mano
(in realtà mista).

## Primi passi

1. **🎤 Attiva voce e microfono** (la prima volta scarica circa 200 MB, poi resta nel visore).
2. **Chiave di Claude** (facoltativa): serve per creare qualsiasi oggetto e per la scansione. Resta solo nel visore.
3. **📷 Abilita fotocamera** per la scansione.

In VR tieni premuto **A** (o X) e parla. In **realtà mista** prendi un oggetto vero, tienilo davanti agli occhi e
giralo piano: la copia 3D compare sulla scrivania.

Il codice completo (anche l'app nativa per il Quest) è nel repository privato `metaquest`.

## Crediti

- Volto dell'ologramma: modello Face Cap (Bannaflak), dagli esempi di three.js.
- `@anthropic-ai/sdk` (Apache 2.0), transformers.js e ONNX Runtime (MIT), in `src/vendor/`.
- Voce: Piper «Miro» it-IT di OpenVoiceOS (CC BY-NC-ND 4.0, uso personale), espeak-ng (GPL-3.0) via jsDelivr.

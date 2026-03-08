# Proposta: Prelievo rapido unificato

## Problema attuale

1. Operatore cerca su **Dashboard** → vede dove si trova
2. Deve andare manualmente su **Movimenti** (menu)
3. Deve **cercare di nuovo** il materiale
4. Sceglie magazzino, inserisce quantità, scansiona

**Risultato**: 4 passaggi, due ricerche, cambio pagina.

---

## Soluzione proposta: flusso unico su Movimenti

### Idea

**Movimenti** diventa la schermata principale per il prelievo. Una sola ricerca, posizione in evidenza, scansione sulla stessa pagina.

### Flusso target (3 passaggi)

1. **Apri Movimenti** → campo "Cosa prelevi?" in evidenza
2. **Cerca** (es. "bulloni 20mm") → appare subito:
   - Materiale
   - **Dove si trova** (es. "PRM · Scaffale 5 · Luogo A") in grande
   - Pulsante "Scansiona per prelevare"
3. **Vai allo scaffale** (con lo schermo aperto) → **Scansiona** → quantità → Conferma

Nessun cambio pagina, nessuna ricerca ripetuta.

---

## Modifiche tecniche

### 1. Movimenti: posizione in evidenza

Quando l’operatore seleziona un materiale (dopo la scelta del magazzino):

- Mostrare un **box grande** con:
  - **"Vai a: PRM · Scaffale 5 · Luogo A"**
  - Font grande (es. 20px), ben leggibile
- Questo box resta visibile sopra il form quantità/note
- L’operatore può andare allo scaffale tenendo lo schermo aperto

### 2. Link "Preleva" dalla Dashboard

Sulla Dashboard, quando un materiale è selezionato e ha giacenza:

- Aggiungere pulsante **"Preleva"**
- Link: `/movimenti?code=XXX`
- Movimenti legge `code` dall’URL e carica subito quel materiale (senza nuova ricerca)

### 3. Movimenti: gestione parametro `?code=`

- All’apertura, se c’è `?code=XXX` nell’URL:
  - Chiamare `pickItemByCode(code)` in automatico
  - Mostrare subito materiale + posizione + form prelievo

### 4. Ordine degli elementi (solo prelievo OUT)

Layout proposto:

```
[Cerca materiale]  [Scanner]  [NFC]

--- Se materiale selezionato ---

┌─────────────────────────────────────────┐
│  VAI A: PRM · Scaffale 5 · Luogo A      │  ← BOX GRANDE
└─────────────────────────────────────────┘

Materiale: LM618 · Bulloni 20mm
UM: PZ · Disponibili: 12

[Note] [Quantità] [Scansiona] [Salva]
```

---

## Opzione alternativa: pagina dedicata /prelievo

Se Movimenti resta troppo complessa (storico, filtri, entrate, ecc.):

- Creare **/prelievo**: pagina minimale solo per prelievo
- Stesso flusso: cerca → posizione → scansiona → conferma
- Link nel menu: "Prelievo rapido" (anche come prima voce)

---

## Riepilogo

| Modifica | Effetto |
|----------|---------|
| Box "Vai a: ..." in evidenza | L’operatore vede subito dove andare |
| Link "Preleva" su Dashboard | Un click per passare al prelievo con materiale già caricato |
| Parametro `?code=` su Movimenti | Nessuna ricerca ripetuta |
| Layout riorganizzato | Ricerca, posizione e azioni sulla stessa schermata |

---

## Da decidere

1. **Movimenti** vs **/prelievo**: integrare in Movimenti o creare pagina dedicata?
2. **Sidebar**: aggiungere "Prelievo rapido" come prima voce del menu?
3. **Dashboard**: mantenere la ricerca attuale e aggiungere solo "Preleva", o semplificare?

/* DFAK – Repertorio · aiuto.js (T9-1, scelta C del 19/11/2026)
 * Tasto "?" in testata: l'aiuto della schermata corrente in un riquadro sopra la schermata, più l'indice di tutte.
 * Funziona anche senza rete (il file è nella memoria offline). Le righe "admin" si vedono solo con la chiave ADMIN.
 * Testi brevi, a passi, per chi è pratico col telefono ma non conosce l'app. */
(function () {
  'use strict';
  const TESTI = {
    vInizio: { titolo: 'Inizio', passi: [
      'Qui trovi le cose da guardare appena apri l\'app.',
      '"Novità dall\'ultima visita": cosa hanno cambiato gli altri da quando sei passato. Tocca una riga per aprire il brano o la serata. Le novità spariscono da sole dopo 3 aperture dell\'app (distanti almeno mezz\'ora); con "Visto" le togli subito.',
      '"Prossima serata": tocca per aprire la scaletta. "▶ Palco della prossima serata" porta direttamente al palco.',
      '"Da sistemare": un testo aggiunto chiede di controllare la struttura del brano. Quando è a posto, chiunque tocca "Sistemato".',
      '"Ultimi 7 giorni": brani nuovi, testi aggiunti e strutture sistemate della settimana, uguale per tutti.',
      'Senza rete l\'app si può consultare (dati dell\'ultima apertura), ma non si modifica niente.',
      'Importante: in Chrome non cancellare mai i dati del sito "github.io" (pulizia della cronologia, "Cancella dati del sito"): perderesti il tuo link personale e la copia per l\'uso senza rete.'
    ], admin: ['"Serate da collegare" (solo tu): serate che aspettano setup o collegamento. Spariscono da sole quando sono a posto.'] },
    vRepertorio: { titolo: 'Repertorio', passi: [
      'Elenco dei brani in ordine alfabetico, con tonalità, accordatura e BPM. "In prova" vuol dire che il brano non è ancora Definitivo.',
      'I pallini con le sigle sono lo stato di studio di ognuno; il tuo è evidenziato.',
      'Filtri in alto: "Tutti", "Pronti per tutti" (tutti e 5 hanno "Lo so"), "Miei da sistemare" (quelli che non sai ancora).',
      '"Chi è pronto" mostra una tabella brani × membri; "Elenco" torna alla lista.',
      '"+ Nuovo brano": si salva da solo appena scrivi il titolo.'
    ] },
    vBrano: { titolo: 'Scheda del brano', passi: [
      'Tutto si salva da solo mentre scrivi (in alto a destra compare "salvato ✓"). Serve la rete.',
      'Tonalità: scegli quella del disco e sposta con − e + i semitoni con cui la suonate.',
      'Tempo: BPM scritto o con "TAP" (batti almeno 4 volte sull\'unità di riferimento). La durata si calcola dalla struttura; se ne scrivi una a mano vale quella.',
      'Struttura: "+ Sezione" per Intro, Strofa, Rit…; tocca una sezione per battute, ripetizioni, chi suona e note. Riordina con ≡ o con le frecce.',
      '"+ Testo" per inserire il testo (incolla, foto o dettatura). "Leggi tutto il testo" lo mostra intero.',
      '"▶ Metronomo" suona la struttura; "▶" su una sezione parte da lì. "▶ Palco" apre la vista grande per suonare.',
      '"Il mio stato": Da studiare, In studio, Da ripassare, Lo so. Lo cambi solo per te, anche sui brani Definitivi.',
      'Brano "Definitivo": si guarda e basta. Per cambiarlo chiedi all\'ADMIN di riportarlo In prova. Se viene cambiato e richiuso, i "Lo so" di tutti tornano "Da ripassare".'
    ], admin: [
      '"Segna Definitivo" / "Riporta In prova" in cima alla scheda (doppio tocco). Fallo dopo la decisione su WhatsApp.',
      '"Elimina brano" in fondo (doppio tocco): toglie anche sezioni, testi e stati; resta traccia nello Storico.'
    ] },
    vTesto: { titolo: 'Inserire il testo', passi: [
      'Tre modi: incolla il testo, dettalo con il microfono della tastiera, oppure "Da foto" (scegli la lingua prima di scattare).',
      'Prima di confermare metti a mano una riga vuota tra una sezione e l\'altra (strofa, ritornello…): né la foto né il copia-incolla da Google le portano, ed è da lì che l\'app divide le sezioni.',
      'Poi "Dividi in strofe": controlla i blocchi e a quale sezione vanno. Un ritornello identico diventa un testo solo condiviso.',
      '"Conferma" salva. Se il brano non aveva struttura, la crea dal testo; poi si aggiungono gli strumentali. In Inizio comparirà "Da sistemare" per controllare.'
    ] },
    vLettura: { titolo: 'Leggi tutto il testo', passi: [
      'Il testo intero del brano, sezione per sezione. Si legge anche senza rete.',
      '"◀ Scheda brano" per tornare.'
    ] },
    vMetronomo: { titolo: 'Metronomo da solo', passi: [
      'Un metronomo libero, senza brano: BPM con −5 −1 +1 +5 o "TAP".',
      'Scegli metro, riferimento e feel; ♩ solo i battiti, ♪ anche gli ottavi.',
      '"▶ Avvia". Usa cuffie a filo: con il Bluetooth il click arriva in ritardo.',
      'Accento, volume, conteggio e lampeggio vengono dalle tue Impostazioni.'
    ] },
    vSerate: { titolo: 'Serate', passi: [
      '"+ Nuova serata": si salva appena c\'è la data. Le serate prossime sono in ordine di data; le passate si aprono sotto.',
      'Setup: le schede tecniche ideali (si guardano e si stampano).',
      'Locali: la rubrica con i contatti; la scrivono tutti. Segna chi tiene il contatto.'
    ], admin: ['"+ Nuovo setup" e "Referente tecnico" (nome e telefono che vanno sul foglio).'],
      drum: ['"Il mio set di batteria": prepari il tuo set; l\'ADMIN lo mette nello stage plan.'] },
    vSerata: { titolo: 'Serata e scaletta', passi: [
      'In alto data, orario d\'inizio, locale (scrivilo o sceglilo dalla rubrica) e note.',
      'Scaletta: "+ Brani" per sceglierli (vanno nell\'ordine in cui li tocchi), "+ Pausa", "+ Bis", "+ Riga libera" (ospite, stacchetto…).',
      'Riordina con ≡ o con le frecce; tocca una riga per la sua nota (vale solo per questa serata); tocca il titolo per aprire il brano.',
      'Durate per set e totale; con l\'orario d\'inizio anche gli orari previsti.',
      '"Anteprima di stampa": il foglio A4 per il palco, uguale per tutti; da lì "Stampa" o "Salva come PDF".',
      '"▶ Palco" per suonare la scaletta; "Scarica per il palco" salva un file da aprire anche senza app.',
      '"Scheda tecnica": channel list e stage plan della serata. "Duplica serata" copia la scaletta in una serata nuova.'
    ], admin: ['Setup e collegamento della serata li scegli tu. "Elimina serata" in fondo (doppio tocco).'] },
    vScegli: { titolo: 'Aggiungi brani', passi: [
      'Tocca i brani nell\'ordine in cui li vuoi: il numero accanto dice la posizione. I brani già in scaletta sono segnati.',
      '"Aggiungi" li mette in scaletta (prima del Bis, se c\'è).'
    ] },
    vStampa: { titolo: 'Anteprima di stampa', passi: [
      'Il foglio esce così. "Stampa" apre la finestra di stampa: scegli la stampante oppure "Salva come PDF" per girarlo su WhatsApp.',
      'Il nome del PDF ha già data e locale.'
    ] },
    vLocale: { titolo: 'Locale', passi: [
      'Nome, città e dati tecnici del locale (mixer, palco, impianto, spie, canali liberi).',
      'Contatti: fino a 3, con chi della band tiene il contatto.',
      'Si salva da solo; lo possono scrivere tutti.'
    ], admin: ['"Elimina locale" in fondo (doppio tocco).'] },
    vScheda: { titolo: 'Scheda tecnica', passi: [
      'Collegamento, Canali, Monitor, Palco, Altro: le parti della scheda. La modifica solo l\'ADMIN; tutti la guardano e la stampano.',
      '"Invia al locale": 1) "Foglio e PDF" per salvare il PDF; 2) scegli il contatto e "Scrivi su WhatsApp", poi allega il PDF con la graffetta. "Segna come inviata" quando l\'hai mandata.',
      '"Foglio e stampa" mostra il foglio da stampare.'
    ], admin: [
      'Palco: tocca un oggetto per metterlo al centro, poi trascinalo col dito; con + ingrandisci, frecce per la precisione.',
      '"Metti il set di DRUM" mette il set salvato da DRUM (o quello di partenza). Per spostarlo tutto: scegli un pezzo e accendi "Sposta tutta la batteria".',
      'Una modifica dopo un invio apre una nuova revisione.'
    ] },
    setDrum: { titolo: 'Il mio set di batteria', passi: [
      'Qui prepari il tuo set: lo usa l\'ADMIN con "Metti il set di DRUM" nello stage plan. Contano le posizioni tra i pezzi, non sul palco.',
      'Trascina i pezzi col dito (si agganciano ogni 5 cm); tocca un pezzo per etichetta, rotazione e frecce di precisione. "Togli" lo elimina.',
      'Sotto, i pezzi da aggiungere. "Sposta tutta la batteria" muove tutto insieme.',
      'Non si salva da solo: tocca "Salva il mio set" prima di uscire.'
    ] },
    vSchedaStampa: { titolo: 'Foglio della scheda tecnica', passi: [
      'Il foglio come lo vede il tecnico del locale. "Stampa" → stampante o "Salva come PDF".'
    ] },
    vPalco: { titolo: 'Palco', passi: [
      'La sezione in corso grande, con quella dopo; "poi:" avvisa dell\'ultima battuta.',
      '"▶ Start" fa partire il click dalla sezione corrente; ‹ e › cambiano sezione, "‹‹ brano" e "brano ››" cambiano brano della scaletta.',
      'Se DRUM è in diretta, il tuo telefono segue il suo start: "Segui" per agganciarti, "Non seguire più" per scorrere a mano.',
      'Lo schermo resta acceso finché l\'app è in primo piano. "◀" per uscire.'
    ] },
    vImpostazioni: { titolo: 'Impostazioni', passi: [
      'Valgono solo per te e si salvano da sole: notazione delle tonalità, suono reale, battute, evidenzia la mia parte, testi nelle sezioni, metronomo, caratteri del palco.',
      'Servono la rete per salvarle.'
    ] },
    vAdmin: { titolo: 'Amministrazione', passi: [], admin: [
      'Link personali: copia e manda a ognuno il suo. Se un link finisce in giro, "Rigenera": il vecchio smette subito di funzionare.',
      '"Fai un backup ora": prima di ogni aggiornamento del motore.',
      '"Misura 5 letture": quanto ci mette il motore a rispondere.',
      '"Esci da amministrazione" toglie solo la chiave ADMIN da questo telefono.'
    ] },
    vNessuno: { titolo: 'Serve il tuo link personale', passi: [
      'Apri l\'app dal link personale che ti ha mandato Francesco: il telefono lo ricorda.',
      'In Chrome non cancellare mai i dati del sito "github.io".'
    ] }
  };
  const ORDINE = ['vInizio', 'vRepertorio', 'vBrano', 'vTesto', 'vLettura', 'vMetronomo', 'vSerate', 'vSerata', 'vScegli', 'vStampa', 'vLocale',
    'vScheda', 'setDrum', 'vSchedaStampa', 'vPalco', 'vImpostazioni', 'vAdmin'];
  let aperto = false;

  function e(tag, cls, testo) { const x = document.createElement(tag); if (cls) x.className = cls; if (testo !== undefined) x.textContent = testo; return x; }
  /** Disegna l'aiuto di "id" (con le righe ADMIN se admin, quelle di DRUM se drum). */
  function mostra(id, o) {
    o = o || {};
    const t = TESTI[id] || TESTI.vInizio, box = document.getElementById('aiuto'), corpo = document.getElementById('aiutoCorpo');
    corpo.textContent = '';
    corpo.append(e('h2', 'gotico', t.titolo));
    const ol = e('ol', 'aiuto-passi');
    t.passi.forEach((p) => ol.append(e('li', '', p)));
    if (o.drum) (t.drum || []).forEach((p) => ol.append(e('li', 'aiuto-drum', p)));
    if (o.admin) (t.admin || []).forEach((p) => ol.append(e('li', 'aiuto-admin', p)));
    if (!ol.children.length) ol.append(e('li', '', 'Questa schermata serve all\'amministratore.'));
    corpo.append(ol);
    const ind = e('details', 'aiuto-indice'); ind.append(e('summary', '', 'Tutte le istruzioni'));
    const ul = e('ul');
    ORDINE.filter((k) => k !== id && (k !== 'vAdmin' || o.admin) && (k !== 'setDrum' || o.drum)).forEach((k) => {
      const b = e('button', 'link', TESTI[k].titolo); b.type = 'button'; b.dataset.aiuto = k;
      b.addEventListener('click', () => { mostra(k, o); box.scrollTop = 0; });
      const li = e('li'); li.append(b); ul.append(li);
    });
    ind.append(ul); corpo.append(ind);
    box.dataset.vista = id;
  }
  function apri(id, o) {
    mostra(id, o);
    document.getElementById('aiuto').hidden = false;
    if (!aperto) { aperto = true; history.pushState({ aiuto: 1 }, ''); }   // il tasto indietro chiude l'aiuto, non l'app
  }
  function chiudi(daIndietro) {
    if (!aperto) return;
    aperto = false;
    document.getElementById('aiuto').hidden = true;
    if (!daIndietro && history.state && history.state.aiuto) history.back();
  }
  window.addEventListener('popstate', () => { if (aperto) chiudi(true); });
  document.getElementById('aiutoChiudi').addEventListener('click', () => chiudi(false));
  window.Aiuto = { TESTI, ORDINE, apri, chiudi, aperto: () => aperto };
})();

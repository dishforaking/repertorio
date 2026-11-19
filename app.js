/* DFAK – Repertorio · comportamento dell'app e chiamate al motore (T2 Repertorio e scheda brano, T3 Struttura a sezioni, T5 Testi e bacheca,
 * T6 Metronomo e schermo sempre acceso, T7 Serate, scaletta e stampa). */
'use strict';

const VERSIONE_INTERFACCIA = 10;  // T9-1: stato del brano solo ADMIN, novità dall'ultima visita, set di DRUM, aiuto (motore v10)
const _VI_T7 = 5;   // il motore rifiuta interfacce più vecchie della sua minima
const MOTORE_MINIMO = 10;         // l'app non scrive su motori più vecchi di questo (T9-1: blocco del Definitivo e set di DRUM)
const MOTORE = 'https://script.google.com/macros/s/AKfycbw2kaLgGlfxO5QIcmC1Ax9Ue8z7CBJNdcwpwr9oBsq_P2_MsS5YCIM-9tbfIhgWvWRIuw/exec';

const $ = (id) => document.getElementById(id);
/* Tutto ciò che resta sul telefono ha il prefisso "dfak-". */
const memoria = {
  get(k) { try { return JSON.parse(localStorage.getItem('dfak-' + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('dfak-' + k, JSON.stringify(v)); } catch (e) { /* memoria piena o bloccata */ } },
  del(k) { try { localStorage.removeItem('dfak-' + k); } catch (e) { /* niente */ } }
};
const ora = (t) => new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dataOra = (t) => (t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
function mostra(id, testo, errore) { const el = $(id); el.textContent = testo; el.hidden = !testo; el.classList.toggle('errore', !!errore); }
function el(tag, classe, testo) { const e = document.createElement(tag); if (classe) e.className = classe; if (testo !== undefined) e.textContent = testo; return e; }

/* ---------- Codice dal link: si salva sul telefono e sparisce dalla barra ---------- */
(function prendiCodiceDalLink() {
  const k = new URLSearchParams(location.search).get('k');
  if (k) {
    memoria.set('daRiconoscere', k);   // membro o ADMIN? lo dice il motore (riconosci)
    history.replaceState(null, '', location.pathname);
  }
})();
const codice = () => memoria.get('codice');
const chiaveAdmin = () => memoria.get('chiaveAdmin');

/* ---------- Stato ---------- */
const stato = {
  app: '…', motore: memoria.get('motore') || '…',
  dati: memoria.get('dati'),     // ultima copia ricevuta dal motore: { risposta, quando }
  // (collaudo T8) il metro arrivato come data ("2026-04-03T22:00:00.000Z") torna "4/4": vedi sistemaCopia
  admin: false,
  membriAdmin: null
};
const risposta = () => stato.dati && stato.dati.risposta;
const io = () => { const r = risposta(); return r && r.io; };
const brani = () => { const r = risposta(); return (r && r.brani) || []; };
const statiStudio = () => { const r = risposta(); return (r && r.statiStudio) || []; };
function impostazioni() { const r = risposta(); return (r && r.impostazioni) || Regole.predefinite(); }
/** (collaudo T8) Il foglio aveva trasformato "4/4" in una data: si rimette a posto ogni copia, prima di usarla e di salvarla. */
function sistemaCopia() { if (stato.dati && stato.dati.risposta) Regole.sistemaMetri(stato.dati.risposta); }
sistemaCopia();   // la copia già sul telefono (anche senza rete) guarisce subito
function salvaCopia() { sistemaCopia(); if (stato.dati) memoria.set('dati', stato.dati); }

/* ---------- Chiamate al motore ---------- */
class ErroreRete extends Error {}
// Senza rete = telefono offline OPPURE motore irraggiungibile (segnale debole: il telefono dice "in linea").
let motoreIrraggiungibile = false;
const senzaRete = () => !navigator.onLine || motoreIrraggiungibile;

async function chiama(azione, dati) {
  if (!navigator.onLine) throw new ErroreRete('senza rete');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  const inizio = performance.now();
  let risp;
  try {
    // Corpo come stringa e NESSUNA intestazione aggiunta: Chrome lo manda come testo semplice
    // e non chiede il permesso preventivo che Apps Script non sa dare.
    risp = await fetch(MOTORE, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ k: codice() || undefined, ka: chiaveAdmin() || undefined, v: VERSIONE_INTERFACCIA, azione }, dati || {})),
      redirect: 'follow', credentials: 'omit', signal: ctrl.signal
    });
  } catch (e) {
    motoreIrraggiungibile = true; aggiornaRete();
    throw new ErroreRete(e.name === 'AbortError' ? 'tempo scaduto' : 'motore non raggiungibile');
  } finally { clearTimeout(timer); }
  if (motoreIrraggiungibile) { motoreIrraggiungibile = false; aggiornaRete(); }
  let j;
  try { j = await risp.json(); } catch (e) { throw new Error('risposta non valida dal motore (HTTP ' + risp.status + ')'); }
  j.msTotale = Math.round(performance.now() - inizio);
  if (j.motore) { stato.motore = j.motore; memoria.set('motore', j.motore); $('versioneMotore').textContent = j.motore; }
  if (j.errore === 'versione') mostra('avvisoCompat', 'Questa app è più vecchia del motore: aggiornala (chiudi e riapri, poi tocca "Nuova versione").');
  return j;
}

/** Prima di ogni scrittura: rete presente e motore non più vecchio dell'app. */
function puoScrivere(idEsito) {
  if (senzaRete()) { if (idEsito) mostra(idEsito, 'Serve la rete per modificare: niente è stato salvato.', true); return false; }
  if (Number(stato.motore) && Number(stato.motore) < MOTORE_MINIMO) {
    mostra('avvisoCompat', 'Il motore è più vecchio di questa app: non salvo nulla finché non viene aggiornato.');
    return false;
  }
  return true;
}

function aggiornaRete() {
  const av = $('avvisoRete');
  const fuori = senzaRete();
  $('impostazioniSenzaRete').hidden = !fuori;
  const fs = $('moduloImpostazioni').querySelector('fieldset');
  if (fs) fs.disabled = fuori;
  const blocco = branoBloccato();   // T9-1: un brano Definitivo si guarda e basta
  $('campiBrano').disabled = fuori || !io() || blocco;
  $('btnNuovo').disabled = fuori;
  $('btnStatoBrano').disabled = fuori;
  $('btnVisto').disabled = fuori;
  document.querySelectorAll('#mioStato button').forEach((b) => { b.disabled = fuori; });
  $('btnElimina').disabled = fuori;
  // T3: senza rete (o con la sola chiave ADMIN) la struttura si guarda e basta
  $('campiStruttura').disabled = fuori || !io() || blocco;
  $('btnSezione').disabled = fuori || !io() || !branoSalvato() || blocco;
  if (ordinatore) ordinatore.option('disabled', fuori || !io() || blocco);
  // T5: testi e bacheca
  $('btnTesto').disabled = fuori || !io() || !branoSalvato() || blocco;
  $('btnConferma').disabled = fuori;
  document.querySelectorAll('button.sistemato').forEach((b) => { b.disabled = fuori; });
  // T7: serate e scaletta (senza rete si leggono e si stampano)
  $('campiSerata').disabled = fuori || !io();
  $('campiScaletta').disabled = fuori || !io() || !(serataSalvata() || scal.righe.length);
  if (ordinatoreScaletta) ordinatoreScaletta.option('disabled', fuori || !io());
  $('btnNuovaSerata').disabled = fuori;
  $('btnDuplica').disabled = fuori || !io() || !serataSalvata();
  $('btnDuplica').hidden = !io();
  $('btnEliminaSerata').disabled = fuori;
  $('btnScegliOk').disabled = fuori || !scelti.length;
  if (window.Scheda) Scheda.aggiornaAbilitati();   // T8-bis-1: scheda tecnica solo ADMIN e con la rete
  if (window.Scheda && serataAperta && !$('vSerata').hidden) Scheda.aggiornaSerata();   // variante T8-bis-2: tasti del setup senza rete
  if (window.Locali) { Locali.disegnaLista(); Locali.ridisegna(); }   // T8-bis-2: rubrica in sola lettura senza rete
  if (!fuori) { av.hidden = true; return; }
  const copia = stato.dati;
  av.textContent = (navigator.onLine ? 'Senza rete (motore non raggiungibile)' : 'Senza rete') + ' — dati del ' + (copia ? ora(copia.quando) : '(nessuna copia)') + '. Si può consultare, non modificare.';
  av.hidden = false;
}
window.addEventListener('online', () => { aggiornaRete(); avvia(); });
window.addEventListener('offline', aggiornaRete);

/* ---------- Avvio: riconoscimento del link, poi una sola lettura ---------- */
async function riconosciLink() {
  const k = memoria.get('daRiconoscere');
  if (!k) return;
  const j = await chiama('riconosci', { codice: k, k: undefined, ka: undefined });
  memoria.del('daRiconoscere');
  if (!j.ok || j.tipo === 'nonValido') {
    mostra('avvisoCodice', 'Questo link non è valido (forse è stato rigenerato): chiedi quello nuovo.');
  } else if (j.tipo === 'admin') {
    memoria.set('chiaveAdmin', k);            // si AGGIUNGE: chi era DRUM resta DRUM
  } else {
    if (codice() !== k) { memoria.del('dati'); stato.dati = null; }   // persona diversa: niente dati vecchi
    memoria.set('codice', k);
  }
}

async function avvia() {
  if (!navigator.onLine) return;
  try {
    await riconosciLink();
    if (!codice() && !chiaveAdmin()) { disegna(); return; }
    const j = await chiama('avvio');
    if (!j.ok) return gestisciRifiuto(j);
    mostra('avvisoCodice', '');
    stato.dati = { risposta: j, quando: Date.now() };
    salvaCopia();
    stato.admin = !!j.admin;
    disegna();
  } catch (e) {
    if (!(e instanceof ErroreRete)) mostra('avvisoCodice', 'Lettura non riuscita: ' + e.message);
  }
}

function gestisciRifiuto(j) {
  if (j.errore === 'chiaveAdmin') {
    memoria.del('chiaveAdmin'); stato.admin = false;
    mostra('avvisoCodice', 'La chiave di amministrazione non vale più (è stata rigenerata): l\'ho tolta da questo telefono.');
    return avvia();
  }
  if (j.errore === 'codice') {
    memoria.del('codice'); memoria.del('dati'); stato.dati = null;
    mostra('avvisoCodice', 'Il tuo link personale non vale più (è stato rigenerato): chiedi quello nuovo a Chicco.');
    disegna();
  }
}

/* ---------- Disegno delle schermate ---------- */
function disegna() {
  const r = risposta();
  const me = io();
  const conosciuto = !!(codice() || chiaveAdmin());
  $('chiSigla').textContent = me ? me.sigla + ' · ' + me.nome : (chiaveAdmin() ? 'ADMIN' : '');
  $('saluto').textContent = me ? 'Ciao, ' + me.nome : (chiaveAdmin() ? 'Amministrazione' : 'Benvenuto');
  $('ruolo').textContent = me ? me.sigla + ' · ' + me.ruolo : (chiaveAdmin() ? 'Questo telefono ha solo la chiave di amministrazione.' : '');
  $('datiDel').textContent = r ? 'Dati aggiornati al ' + dataOra(stato.dati.quando) : '';
  stato.admin = !!(chiaveAdmin() && (r ? r.admin : true));
  $('navAdmin').hidden = !stato.admin;
  document.querySelector('[data-vista="vImpostazioni"]').hidden = !me && !!chiaveAdmin();
  $('infoTelefono').textContent = me ? 'Qui sei ' + me.sigla + ' (' + me.nome + ') e in più hai la chiave di amministrazione. "Esci" toglie solo la chiave: resti ' + me.sigla + '.'
    : 'Questo telefono ha solo la chiave di amministrazione.';
  if (r && me && !moduloImpostazioniOccupato()) disegnaImpostazioni(r.impostazioni);
  disegnaRepertorio();
  disegnaBacheca();
  disegnaVisita();   // T9-1
  disegnaSerate();
  if (window.Scheda) Scheda.ridisegna();   // T8-bis-1
  if (window.Locali) Locali.ridisegna();   // T8-bis-2
  if (!conosciuto) return vai('vNessuno');
  // T5: mentre si inserisce un testo o si legge, i dati nuovi non portano via dalla schermata (T7: idem scelta brani e anteprima)
  if (!$('vTesto').hidden || !$('vLettura').hidden || !$('vScegli').hidden || !$('vStampa').hidden) { aggiornaRete(); return; }
  if (!$('vPalco').hidden && palco) { aggiornaRete(); return; }   // T8: sul palco i dati nuovi non spostano niente
  if (!$('vScheda').hidden || !$('vSchedaStampa').hidden) { aggiornaRete(); return; }   // T8-bis-1: la scheda si aggiorna da sola (Scheda.ridisegna)
  if (!$('vLocale').hidden) { aggiornaRete(); return; }   // T8-bis-2: idem il locale (Locali.ridisegna)
  let corrente = memoria.get('vista') || 'vInizio';
  if (corrente === 'vPalco') corrente = memoria.get('palcoDa') === 'brano' ? 'vBrano' : memoria.get('palcoDa') === 'serata' ? 'vSerata' : 'vInizio';
  if (corrente === 'vTesto' || corrente === 'vLettura') corrente = 'vBrano';
  if (corrente === 'vAdmin' && !stato.admin) corrente = 'vInizio';
  if (corrente === 'vImpostazioni' && !me) corrente = 'vInizio';
  $('navMetronomo').hidden = !metroAttivo();
  if (corrente === 'vMetronomo' && !metroAttivo()) corrente = 'vInizio';
  if (corrente === 'vScegli' || corrente === 'vStampa') corrente = 'vSerata';
  if (corrente === 'vScheda' || corrente === 'vSchedaStampa') {
    if (!window.Scheda) return;   // scheda.js si carica dopo app.js e richiama disegna()
    if (Scheda.riapri()) return;
    corrente = 'vSerate';
  }
  if (corrente === 'vLocale') {
    if (!window.Locali) return;   // locali.js si carica dopo e richiama disegna()
    if (Locali.riapri()) return;
    corrente = 'vSerate';
  }
  if (corrente === 'vSerata') {
    if (scalettaOccupata()) { aggiornaRete(); return; }    // si sta scrivendo: non si ridisegna sotto le dita
    const ids = memoria.get('serataAperta');
    if (serataAperta && serataAperta.id === ids && !serataSalvata()) { aggiornaRete(); return; }   // nuova o copia non ancora salvata
    if (ids && serateTutte().some((s) => s.id === ids)) { apriSerata(ids, true); return; }
    corrente = 'vSerate';
  }
  if (corrente === 'vBrano') {
    if (schedaOccupata()) { aggiornaRete(); return; }      // si sta scrivendo: non si ridisegna sotto le dita
    const id = memoria.get('branoAperto');
    if (id && brani().some((b) => b.id === id)) { apriBrano(id, true); return; }
    corrente = 'vRepertorio';
  }
  vai(corrente);
}

function vai(vista) {
  if (vista !== 'vStampa' && vista !== 'vSchedaStampa' && typeof TITOLO_APP !== 'undefined') document.title = TITOLO_APP;   // variante T7: il nome del PDF vale solo nell'anteprima
  if (metro.inCorso() && ((metroDove === 'brano' && !['vBrano', 'vLettura'].includes(vista)) || (metroDove === 'solo' && vista !== 'vMetronomo') || (metroDove === 'palco' && vista !== 'vPalco'))) metro.ferma();
  document.body.classList.toggle('in-palco', vista === 'vPalco');   // T8: il palco usa tutto lo schermo (niente testata e barra)
  if (vista === 'vMetronomo') preparaSolo();
  if (vista !== 'vMetronomo') tocchiSolo = [];
  document.querySelectorAll('.vista').forEach((v) => { v.hidden = v.id !== vista; });
  const voce = ['vBrano', 'vTesto', 'vLettura'].includes(vista) ? 'vRepertorio' : ['vSerata', 'vScegli', 'vStampa', 'vScheda', 'vSchedaStampa', 'vLocale'].includes(vista) ? 'vSerate' : vista === 'vPalco' ? '' : vista;
  document.querySelectorAll('#barra button').forEach((b) => b.classList.toggle('attivo', b.dataset.vista === voce));
  $('btnImpostazioni').classList.toggle('attivo', vista === 'vImpostazioni');   // T7 (decisione 2B): le impostazioni sono la ⚙ in testata
  if (!['vBrano', 'vTesto', 'vLettura'].includes(vista)) tornaSerata = null;
  $('barra').hidden = vista === 'vNessuno';
  if (vista !== 'vNessuno') memoria.set('vista', vista);
  if (vista === 'vAdmin') caricaMembriAdmin();
  if (vista !== 'vBrano') { tocchiTap = []; }
  aggiornaRete();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#barra button, #btnImpostazioni').forEach((b) => b.addEventListener('click', () => vai(b.dataset.vista)));

/* ---------- Repertorio: elenco, filtri, matrice ---------- */
const CLASSE_STATO = { 'Da studiare': 's0', 'In studio': 's1', 'Da ripassare': 's2', 'Lo so': 's3' };
const SIGLA_STATO = { 'Da studiare': '·', 'In studio': '½', 'Da ripassare': 'R', 'Lo so': '✓' };

function tonalitaDi(b) { const i = impostazioni(); return Regole.tonalitaBrano(b, i.notazione, i.mostraSuonoReale); }
function etichettaAccordatura(a) { return a ? a : ''; }

function disegnaRepertorio() {
  const me = io();
  const filtro = memoria.get('filtro') || 'Tutti';
  const modo = memoria.get('modoRep') || 'elenco';
  const tutti = brani(), stati = statiStudio();
  $('btnNuovo').hidden = !me;
  // filtri con il conteggio
  const fl = $('filtri'); fl.textContent = '';
  Regole.FILTRI.forEach((f) => {
    if (f === 'Miei da sistemare' && !me) return;
    const n = Regole.filtra(tutti, stati, f, me && me.sigla).length;
    const b = el('button', 'filtro' + (f === filtro ? ' attivo' : ''), f + ' ' + n);
    b.type = 'button'; b.dataset.filtro = f;
    b.addEventListener('click', () => { memoria.set('filtro', f); disegnaRepertorio(); });
    fl.append(b);
  });
  document.querySelectorAll('#sceltaModo button').forEach((b) => b.classList.toggle('attivo', b.dataset.modo === modo));
  const elenco = Regole.filtra(tutti, stati, filtro === 'Miei da sistemare' && !me ? 'Tutti' : filtro, me && me.sigla);
  const vuoto = $('repVuoto');
  vuoto.hidden = elenco.length > 0;
  vuoto.textContent = '';
  if (!tutti.length) { vuoto.append(el('p', '', 'Ancora nessun brano.'), el('p', 'tenue', me ? 'Tocca "+ Nuovo brano" per inserire il primo.' : 'I brani li inseriscono i membri della band.')); }
  else if (!elenco.length) vuoto.append(el('p', 'tenue', 'Nessun brano con il filtro "' + filtro + '".'));
  $('listaBrani').hidden = modo !== 'elenco';
  $('matrice').hidden = modo !== 'matrice' || !elenco.length;
  if (modo === 'elenco') disegnaElenco(elenco, stati, me); else disegnaMatrice(elenco, stati, me);
}

function disegnaElenco(elenco, stati, me) {
  const ul = $('listaBrani'); ul.textContent = '';
  elenco.forEach((b) => {
    const t = tonalitaDi(b);
    const li = el('li'); const btn = el('button', 'brano'); btn.type = 'button'; btn.dataset.id = b.id;
    const r1 = el('div', 'r1'); r1.append(el('b', 'titolo', b.titolo));
    if (b.stato !== 'Definitivo') r1.append(el('span', 'etichetta-stato in-prova', 'In prova'));   // T9-1 (D2 A): solo nell'app
    r1.append(el('span', 'ton', t.testo));
    const r2 = el('div', 'r2');
    r2.append(el('span', 'artista', b.artista || ' '));
    const det = [];
    if (t.testoReale) det.push('(' + t.testoReale + ')');
    if (b.accordatura) det.push(etichettaAccordatura(b.accordatura));
    if (b.bpm) det.push(b.bpm + ' BPM');
    r2.append(el('span', 'dettagli', det.join(' · ')));
    const pal = el('div', 'pallini');
    Regole.SIGLE.forEach((s) => {
      const st = Regole.statoDi(stati, b.id, s);
      const p = el('span', 'p ' + CLASSE_STATO[st] + (me && me.sigla === s ? ' mio' : ''), s);
      p.title = s + ': ' + st; pal.append(p);
    });
    btn.append(r1, r2, pal);
    btn.addEventListener('click', () => apriBrano(b.id));
    li.append(btn); ul.append(li);
  });
}

function disegnaMatrice(elenco, stati, me) {
  const box = $('matrice'); box.textContent = '';
  const tab = el('table', 'matrice'); const th = el('thead'); const tr = el('tr');
  tr.append(el('th', 'nomeBrano', 'Brano'));
  Regole.SIGLE.forEach((s) => tr.append(el('th', me && me.sigla === s ? 'mio' : '', s)));
  th.append(tr); tab.append(th);
  const tb = el('tbody');
  elenco.forEach((b) => {
    const r = el('tr');
    const c0 = el('td', 'nomeBrano'); const a = el('button', 'link', b.titolo); a.type = 'button';
    a.addEventListener('click', () => apriBrano(b.id)); c0.append(a);
    if (Regole.prontoPerTutti(stati, b.id)) c0.append(el('span', 'pronto', ' ★'));
    r.append(c0);
    Regole.SIGLE.forEach((s) => {
      const st = Regole.statoDi(stati, b.id, s);
      const c = el('td', 'cella ' + CLASSE_STATO[st] + (me && me.sigla === s ? ' mio' : ''), SIGLA_STATO[st]);
      c.title = b.titolo + ' · ' + s + ': ' + st; r.append(c);
    });
    tb.append(r);
  });
  tab.append(tb); box.append(tab);
  const leg = el('div', 'legenda');
  Regole.STATI_STUDIO.forEach((st) => { const x = el('span', 'voce'); x.append(el('span', 'cella ' + CLASSE_STATO[st], SIGLA_STATO[st]), document.createTextNode(' ' + st)); leg.append(x); });
  leg.append(el('span', 'voce', '★ pronto per tutti'));
  box.append(leg);
}

document.querySelectorAll('#sceltaModo button').forEach((b) => b.addEventListener('click', () => { memoria.set('modoRep', b.dataset.modo); disegnaRepertorio(); }));

/* ---------- Scheda brano ---------- */
let branoAperto = null;        // copia di lavoro: { id, versione, ... } (versione 0 = non ancora salvato)
let timerBrano = null, salvataggioInCorso = false, salvaDiNuovo = false, tocchiTap = [];

function nuovoIdBrano() {
  const a = new Uint8Array(11); crypto.getRandomValues(a);
  return 'r' + Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
}
function schedaOccupata() {
  const attivo = document.activeElement;
  return !$('vBrano').hidden && (!!timerBrano || salvataggioInCorso || (attivo && $('moduloBrano').contains(attivo) && attivo.tagName !== 'BUTTON')
    || !!timerStruttura || strutturaInCorso || editorOccupato() || !!timerTesto || testoInCorso);
}
function moduloImpostazioniOccupato() { return !!timerSalva; }

function riempiScelte() {
  const notaz = impostazioni().notazione;
  const s = $('bTonalita'); const prima = s.value; s.textContent = '';
  s.append(new Option('—', ''));
  [['Maggiori', Regole.ORIGINALI.maggiori], ['Minori', Regole.ORIGINALI.minori]].forEach(([nome, lista]) => {
    const g = document.createElement('optgroup'); g.label = nome;
    lista.forEach((t) => g.append(new Option(Regole.nomeTonalita(t, notaz), t)));
    s.append(g);
  });
  s.value = prima;
  if (!$('bRiferimento').options.length) Regole.RIFERIMENTI.forEach((x) => $('bRiferimento').append(new Option(x, x)));
  if (!$('bMetro').options.length) Regole.METRI.forEach((x) => $('bMetro').append(new Option(x, x)));
  if (!$('bFeel').options.length) Regole.FEEL.forEach((x) => $('bFeel').append(new Option(x, x)));
}

function apriBrano(id, daRidisegno) {
  const b = id ? brani().find((x) => x.id === id) : null;
  if (id && !b) return vai('vRepertorio');
  const altroBrano = !branoAperto || !b || branoAperto.id !== b.id;
  if (!daRidisegno || altroBrano) {     // T6: un brano aperto riparte al 100%, e quello di prima smette di suonare
    if (metro.inCorso() && metroDove === 'brano') metro.ferma();
    tempoStudio = 100;
  }
  branoAperto = b ? Object.assign({}, b) : { id: nuovoIdBrano(), versione: 0, titolo: '', artista: '', tonalitaOriginale: '', scostamento: 0, accordatura: 'Mib', bpm: '', riferimento: 'Quarti', metro: '4/4', feel: 'Dritto', durataManuale: '', note: '', stato: 'In prova' };
  memoria.set('branoAperto', branoAperto.id);
  if (!daRidisegno) { tornaSerata = prossimoTorna; prossimoTorna = null; }   // T7: aperto dalla scaletta
  $('btnIndietro').textContent = tornaSerata ? '◀ Serata' : '◀ Repertorio';
  riempiScelte();
  $('bTitolo').value = branoAperto.titolo;
  $('bArtista').value = branoAperto.artista;
  $('bTonalita').value = branoAperto.tonalitaOriginale;
  $('bScost').textContent = formatoScostamento(branoAperto.scostamento);
  const acc = branoAperto.accordatura;
  const conosciuta = acc === '' || Regole.ACCORDATURE.some((a) => a.valore === acc);
  $('bAccordatura').value = conosciuta ? acc : '__altra';
  $('bAccAltra').hidden = conosciuta; $('bAccAltra').value = conosciuta ? '' : acc;
  $('bBpm').value = branoAperto.bpm;
  $('bRiferimento').value = branoAperto.riferimento;
  $('bMetro').value = branoAperto.metro;
  $('bFeel').value = branoAperto.feel || 'Dritto';
  $('bDurata').value = Regole.scriviDurata(branoAperto.durataManuale);
  $('bNote').value = branoAperto.note;
  $('rifSuggerito').hidden = true;
  tocchiTap = []; $('tapInfo').textContent = 'Batti a tempo sull\'unità di riferimento (almeno 4 tocchi).';
  document.querySelectorAll('#moduloBrano .invalido').forEach((x) => x.classList.remove('invalido'));
  mostra('esitoBrano', '');
  aggiornaAnteprima();
  disegnaStatiBrano();
  caricaStruttura(branoAperto.id);
  $('riquadroElimina').hidden = !stato.admin || !b;
  delete $('btnElimina').dataset.conferma; $('btnElimina').textContent = 'Elimina brano'; $('btnElimina').className = 'pericolo';
  disegnaStatoBrano();
  if (!daRidisegno || $('vBrano').hidden) vai('vBrano'); else aggiornaRete();
  if (!b) $('bTitolo').focus();
}

/**
 * Durata scritta come viene dalla tastiera del telefono (correzione T2 dopo il collaudo: il tastierino
 * numerico dello Xiaomi non ha i due punti). Accetta 4:08, 4.08, 4,08 e solo cifre (408 → 4:08, 1205 → 12:05).
 * Restituisce "m:ss" pronto per le regole, "" se vuoto, null se non si capisce.
 */
function durataDaTastiera(t) {
  t = String(t || '').trim();
  if (!t) return '';
  let m = /^(\d{1,2})[:.,](\d{2})$/.exec(t);
  if (!m) { const c = /^(\d{3,4})$/.exec(t); if (c) m = [t, t.slice(0, -2), t.slice(-2)]; }
  if (!m) return null;
  const testo = Number(m[1]) + ':' + m[2];
  return Regole.leggiDurata(testo) ? testo : null;
}

function formatoScostamento(n) { n = Number(n) || 0; return n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '0'; }

function leggiModuloBrano() {
  const sel = $('bAccordatura').value;
  return {
    id: branoAperto.id,
    titolo: $('bTitolo').value, artista: $('bArtista').value,
    tonalitaOriginale: $('bTonalita').value, scostamento: branoAperto.scostamento,
    accordatura: sel === '__altra' ? $('bAccAltra').value : sel,
    bpm: $('bBpm').value === '' ? '' : Number($('bBpm').value),
    riferimento: $('bRiferimento').value, metro: $('bMetro').value, feel: $('bFeel').value || 'Dritto',
    durataManuale: (() => { const d = durataDaTastiera($('bDurata').value); return d === null ? $('bDurata').value : d; })(), note: $('bNote').value
  };
}

function aggiornaAnteprima() {
  const d = leggiModuloBrano();
  const t = tonalitaDi(d);
  $('bTonTesto').textContent = t.testo;
  $('bTonDettaglio').textContent = t.dettaglio;
  $('bTonReale').textContent = t.testoReale;
  $('bScost').textContent = formatoScostamento(d.scostamento);
  mostraEquivalenza($('bEquivalenza'), d.bpm, d.metro, d.riferimento);
  const b = branoAperto;
  $('bInfo').textContent = b.versione ? (b.stato || 'In prova') + ' · ultima modifica ' + (b.modificatoDa || '') + ' il ' + dataOra(b.modificatoIl) : 'Brano nuovo: si salva appena scrivi il titolo.';
  aggiornaDurate();
}

const CAMPO_ID = { titolo: 'bTitolo', artista: 'bArtista', tonalitaOriginale: 'bTonalita', scostamento: 'bScost', accordatura: 'bAccordatura', bpm: 'bBpm', riferimento: 'bRiferimento', metro: 'bMetro', feel: 'bFeel', durataManuale: 'bDurata', note: 'bNote' };

function cambioBrano() {
  aggiornaAnteprima();
  clearTimeout(timerBrano); timerBrano = null;
  if (!io()) return;
  if (!puoScrivere('esitoBrano')) { statoSalva('serve la rete', 'errore'); return; }
  const n = Regole.normalizzaBrano(leggiModuloBrano());
  document.querySelectorAll('#moduloBrano .invalido').forEach((x) => x.classList.remove('invalido'));
  n.errori.forEach((c) => { const x = $(CAMPO_ID[c]); if (x) x.classList.add('invalido'); });
  if (n.errori.length) {
    statoSalva(n.errori.includes('titolo') ? 'serve il titolo' : 'da correggere', 'errore');
    mostra('esitoBrano', n.errori.includes('titolo') && n.errori.length === 1 ? 'Scrivi il titolo: il brano si salva da lì.' : 'Da correggere: ' + n.errori.map(nomeCampo).join(', ') + '.', true);
    return;
  }
  mostra('esitoBrano', '');
  statoSalva('salvataggio…');
  timerBrano = setTimeout(() => { timerBrano = null; salvaBrano(0); }, 700);
}
function nomeCampo(c) { return { titolo: 'titolo', tonalitaOriginale: 'tonalità', scostamento: 'scostamento', bpm: 'BPM (30–300, intero)', durataManuale: 'durata (m:ss)', riferimento: 'riferimento', metro: 'metro', feel: 'feel' }[c] || c; }

/** Salvataggio in sottofondo, uno alla volta: se nel frattempo cambia qualcosa, si risalva subito dopo. */
async function salvaBrano(tentativo) {
  if (salvataggioInCorso) { salvaDiNuovo = true; return; }
  const dati = leggiModuloBrano();
  if (Regole.normalizzaBrano(dati).errori.length) return;
  salvataggioInCorso = true;
  const id = dati.id;
  try {
    const j = await chiama('salvaBrano', { brano: dati, versione: branoAperto && branoAperto.id === id && branoAperto.versione ? branoAperto.versione : undefined });
    if (!j.ok) {
      statoSalva('non salvato', 'errore');
      mostra('esitoBrano', 'Non salvato: ' + (j.campi ? j.campi.map(nomeCampo).join(', ') : erroreSalvataggio(j)), true);
      return;
    }
    const lista = brani();
    const i = lista.findIndex((x) => x.id === id);
    if (i >= 0) lista[i] = j.brano; else lista.push(j.brano);
    if (j.notizia) { const rr = risposta(); rr.avvisi = avvisiTutti().concat([j.notizia]); disegnaBacheca(); }   // T5: "nuovo brano" negli Ultimi 7 giorni
    if (branoAperto && branoAperto.id === id) {
      Object.assign(branoAperto, { versione: j.brano.versione, modificatoDa: j.brano.modificatoDa, modificatoIl: j.brano.modificatoIl, stato: j.brano.stato });
      $('riquadroElimina').hidden = !stato.admin;
      aggiornaAnteprima();
      if (struttura.brano === id && !struttura.sezioni.length) disegnaStruttura();   // ora si possono aggiungere le sezioni
    }
    salvaCopia();
    disegnaRepertorio();
    statoSalva('salvato ✓', 'salvato');
    if (j.avviso) mostra('esitoBrano', 'Attenzione: ' + j.avviso.modificatoDa + ' aveva modificato questo brano il ' + dataOra(j.avviso.modificatoIl) + '. Hai salvato la tua versione: controlla insieme a lui.', true);
  } catch (e) {
    if (e instanceof ErroreRete && tentativo < 2 && navigator.onLine) {
      statoSalva('riprovo…');
      salvataggioInCorso = false;
      setTimeout(() => salvaBrano(tentativo + 1), tentativo ? 5000 : 2000);
      return;
    }
    statoSalva('non salvato: serve la rete', 'errore');
    mostra('esitoBrano', 'Non salvato: ' + e.message + '. Le modifiche restano su questa schermata finché non la lasci.', true);
  } finally {
    salvataggioInCorso = false;
    if (salvaDiNuovo) { salvaDiNuovo = false; salvaBrano(0); }
  }
}

['bTitolo', 'bArtista', 'bBpm', 'bDurata', 'bNote', 'bAccAltra'].forEach((x) => $(x).addEventListener('input', cambioBrano));
['bTonalita', 'bRiferimento', 'bFeel'].forEach((x) => $(x).addEventListener('change', cambioBrano));
// tastiera con il separatore (virgola o punto) invece del tastierino senza due punti
$('bDurata').inputMode = 'decimal';
$('bDurata').addEventListener('blur', () => { const d = durataDaTastiera($('bDurata').value); if (d) $('bDurata').value = d; });
$('bAccordatura').addEventListener('change', () => {
  const altra = $('bAccordatura').value === '__altra';
  $('bAccAltra').hidden = !altra;
  if (altra) $('bAccAltra').focus();
  cambioBrano();
});
$('bMetro').addEventListener('change', () => {
  const prima = branoAperto.metro, dopo = $('bMetro').value;
  // il suggerimento cambia il riferimento solo se era ancora quello suggerito per il metro di prima
  if ($('bRiferimento').value === Regole.riferimentoSuggerito(prima) && Regole.riferimentoSuggerito(dopo) !== Regole.riferimentoSuggerito(prima)) {
    $('bRiferimento').value = Regole.riferimentoSuggerito(dopo);
    $('rifSuggerito').textContent = 'Riferimento suggerito per ' + dopo + ': ' + Regole.riferimentoSuggerito(dopo).toLowerCase() + ' (si può cambiare).';
    $('rifSuggerito').hidden = Regole.riferimentoSuggerito(dopo) === 'Quarti';
  }
  branoAperto.metro = dopo;
  cambioBrano();
});
function sposta(n) {
  const v = Math.max(-11, Math.min(11, (Number(branoAperto.scostamento) || 0) + n));
  if (v === branoAperto.scostamento) return;
  branoAperto.scostamento = v;
  cambioBrano();
}
$('bMeno').addEventListener('click', () => sposta(-1));
$('bPiu').addEventListener('click', () => sposta(1));

/* Tap tempo: si conta sul tocco (pointerdown), non sul rilascio, per non perdere precisione. */
$('btnTap').addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if ($('campiBrano').disabled) return;
  tocchiTap = Regole.tapAggiungi(tocchiTap, ev.timeStamp || performance.now());
  const bpm = Regole.tapBpm(tocchiTap);
  if (bpm) {
    $('bBpm').value = bpm;
    $('tapInfo').textContent = bpm + ' BPM dal tap (' + tocchiTap.length + ' tocchi, ' + $('bRiferimento').value.toLowerCase() + '). Fermati 2 s per ricominciare.';
    cambioBrano();
  } else {
    $('tapInfo').textContent = tocchiTap.length < 4 ? 'Ancora ' + (4 - tocchiTap.length) + ' tocchi…' : 'Tocchi irregolari: continua a tempo.';
  }
});

$('btnIndietro').addEventListener('click', () => {
  if (timerBrano) { clearTimeout(timerBrano); timerBrano = null; salvaBrano(0); }   // salva subito ciò che era in attesa
  if (timerStruttura) { clearTimeout(timerStruttura); timerStruttura = null; salvaStruttura(0); }
  if (tornaSerata && serateTutte().some((s) => s.id === tornaSerata)) { const s = tornaSerata; tornaSerata = null; return apriSerata(s); }
  vai('vRepertorio');
});
$('btnNuovo').addEventListener('click', () => { if (puoScrivere('esitoBrano')) apriBrano(null); else mostra('repVuoto', 'Serve la rete per aggiungere un brano.', true); });

/* Stati di studio: ognuno cambia solo il proprio; aggiornamento subito a schermo, poi il salvataggio. */
function disegnaStatiBrano() {
  const me = io(); const id = branoAperto.id; const stati = statiStudio();
  const box = $('mioStato'); box.textContent = '';
  $('riquadroStato').hidden = false;
  const salvato = brani().some((b) => b.id === id);
  if (me) {
    const mio = Regole.statoDi(stati, id, me.sigla);
    Regole.STATI_STUDIO.forEach((st) => {
      const b = el('button', 'stato ' + CLASSE_STATO[st] + (st === mio ? ' scelto' : ''), st);
      b.type = 'button'; b.dataset.stato = st;
      b.disabled = senzaRete() || !salvato;
      b.addEventListener('click', () => cambiaStato(st));
      box.append(b);
    });
    if (!salvato) box.append(el('p', 'tenue piccolo', 'Prima scrivi il titolo: poi puoi segnare il tuo stato.'));
  } else box.append(el('p', 'tenue', 'Questo telefono ha solo la chiave di amministrazione: nessuno stato personale.'));
  const ul = $('statiBand'); ul.textContent = '';
  Regole.MEMBRI.forEach((m) => {
    const st = Regole.statoDi(stati, id, m.sigla);
    const rec = stati.find((s) => s.brano === id && s.membro === m.sigla);
    const li = el('li', me && me.sigla === m.sigla ? 'mio' : '');
    li.append(el('b', '', m.sigla), el('span', 'cella ' + CLASSE_STATO[st], SIGLA_STATO[st]), el('span', '', st), el('small', 'tenue', rec && rec.cambiatoIl ? ' ' + ora(rec.cambiatoIl) : ''));
    ul.append(li);
  });
}

async function cambiaStato(nuovo) {
  const me = io(); if (!me || !branoAperto) return;
  if (!puoScrivere('esitoBrano')) return;
  const id = branoAperto.id, sid = Regole.idStato(id, me.sigla);
  const lista = statiStudio();
  const i = lista.findIndex((s) => s.id === sid);
  const prima = i >= 0 ? Object.assign({}, lista[i]) : null;
  const locale = { id: sid, brano: id, membro: me.sigla, stato: nuovo, cambiatoIl: new Date().toISOString() };
  if (i >= 0) lista[i] = Object.assign(lista[i], locale); else lista.push(locale);
  disegnaStatiBrano(); disegnaRepertorio();
  statoSalva('salvataggio…');
  try {
    const j = await chiama('salvaStato', { brano: id, stato: nuovo });
    if (!j.ok) throw new Error(j.errore);
    const k = lista.findIndex((s) => s.id === sid);
    if (k >= 0) lista[k] = j.stato; else lista.push(j.stato);
    salvaCopia();
    statoSalva('salvato ✓', 'salvato');
  } catch (e) {
    const k = lista.findIndex((s) => s.id === sid);
    if (prima) lista[k] = prima; else if (k >= 0) lista.splice(k, 1);
    statoSalva('non salvato', 'errore');
    mostra('esitoBrano', 'Stato non salvato (' + e.message + '): è tornato com\'era.', true);
  }
  if (branoAperto && branoAperto.id === id) disegnaStatiBrano();
  disegnaRepertorio();
}

/* ---------- T9-1 · Stato del brano (solo ADMIN) ---------- */
function branoBloccato() { return !!branoAperto && branoAperto.stato === 'Definitivo'; }
const TESTO_DEFINITIVO = 'Il brano è Definitivo: per cambiarlo chiedi all\'ADMIN di riportarlo In prova.';
/** Messaggio di un salvataggio rifiutato (T9-1: "definitivo" in chiaro). */
function erroreSalvataggio(j) { return j.errore === 'definitivo' ? TESTO_DEFINITIVO : j.errore; }
function disegnaStatoBrano() {
  const b = branoAperto, salvato = !!b && brani().some((x) => x.id === b.id);
  $('testaStatoBrano').hidden = !salvato;
  if (!salvato) return;
  const def = b.stato === 'Definitivo';
  const et = $('etichettaStato'); et.textContent = def ? 'Definitivo' : 'In prova'; et.className = 'etichetta-stato ' + (def ? 'definitivo' : 'in-prova');
  $('notaDefinitivo').hidden = !def;
  const bt = $('btnStatoBrano'); bt.hidden = !stato.admin;
  delete bt.dataset.conferma; bt.className = 'secondario';
  bt.dataset.testo = bt.textContent = def ? 'Riporta In prova' : 'Segna Definitivo';
}
/** Solo ADMIN, doppio tocco: alla richiusura il motore rimette "Da ripassare" i "Lo so" se il brano è cambiato. */
$('btnStatoBrano').addEventListener('click', () => chiediConferma($('btnStatoBrano'), async () => {
  if (!puoScrivere('esitoBrano') || !branoAperto) return;
  const id = branoAperto.id, nuovo = branoAperto.stato === 'Definitivo' ? 'In prova' : 'Definitivo';
  statoSalva('salvataggio…');
  try {
    const j = await chiama('statoBrano', { brano: id, stato: nuovo });
    if (!j.ok) { statoSalva('non salvato', 'errore'); disegnaStatoBrano(); return mostra('esitoBrano', 'Stato non cambiato: ' + j.errore, true); }
    const lista = brani(), i = lista.findIndex((x) => x.id === id);
    if (i >= 0) lista[i] = j.brano;
    const st = statiStudio();
    (j.stati || []).forEach((s) => { const k = st.findIndex((x) => x.id === s.id); if (k >= 0) st[k] = s; else st.push(s); });
    salvaCopia();
    if (branoAperto && branoAperto.id === id) Object.assign(branoAperto, j.brano);
    statoSalva('salvato ✓', 'salvato');
    disegnaStatoBrano(); disegnaStatiBrano(); aggiornaAnteprima(); disegnaRepertorio(); aggiornaRete();
    mostra('esitoBrano', nuovo === 'Definitivo'
      ? 'Segnato Definitivo.' + (j.ripassati ? ' Il brano era cambiato: ' + j.ripassati + (j.ripassati === 1 ? ' "Lo so" è tornato' : ' "Lo so" sono tornati') + ' "Da ripassare".' : '')
      : 'Riportato In prova: ora tutti possono modificarlo.');
  } catch (e) { statoSalva('non salvato', 'errore'); disegnaStatoBrano(); mostra('esitoBrano', 'Stato non cambiato: ' + e.message, true); }
}));

/* ---------- T9-1 · Novità dall'ultima visita (D1 C) ---------- */
function disegnaVisita() {
  const box = $('riquadroVisita'), ul = $('listaVisita'); if (!box) return;
  ul.textContent = '';
  const r = risposta(), me = io();
  const voci = r && me ? Regole.novita(r, me.sigla, r.novitaDa || '') : [];
  box.hidden = !voci.length;
  const NOMI = { nuovo: 'nuovo brano', modificato: 'modificato', Definitivo: 'ora Definitivo', 'In prova': 'riportato In prova', 'da ripassare': 'il tuo "Lo so" è tornato "Da ripassare"', 'nuova o cambiata': 'serata nuova o cambiata' };
  voci.slice(0, 20).forEach((v) => {
    const li = el('li'); const btn = el('button', 'apri'); btn.type = 'button'; btn.dataset.id = v.id;
    const se = v.tipo === 'serata' ? serateTutte().find((x) => x.id === v.id) : null;
    const titolo = se ? [se.data ? Regole.scriviData(se.data, true) : '', se.locale].filter(Boolean).join(' · ') || 'Serata' : v.titolo;
    btn.append(el('b', '', titolo), el('span', 'cosa', v.cosa.map((c) => NOMI[c] || c).join(' · ') + ' — da ' + v.chi.join(', ') + ' · ' + ora(v.quando)));
    btn.addEventListener('click', () => (v.tipo === 'serata' ? apriSerata(v.id) : apriBrano(v.id)));
    li.append(btn); ul.append(li);
  });
  if (voci.length > 20) ul.append(el('li', 'tenue piccolo', 'e altre ' + (voci.length - 20) + '…'));
}
$('btnVisto').addEventListener('click', async () => {
  if (!puoScrivere('avvisoCodice')) return;
  try {
    const j = await chiama('visto');
    if (!j.ok) return statoSalva('non salvato', 'errore');
    const r = risposta(); r.novitaDa = j.ultimaVisita[0]; if (r.io) r.io.ultimaVisita = j.ultimaVisita;
    salvaCopia(); disegnaVisita();
  } catch (e) { statoSalva('non salvato', 'errore'); }
});

/* ---------- T9-1 · Aiuto "?" (scelta C): l'aiuto della schermata corrente, sopra la schermata ---------- */
function vistaCorrente() {
  const v = [...document.querySelectorAll('.vista')].find((x) => !x.hidden);
  const id = v ? v.id : 'vInizio';
  return id === 'vScheda' && window.Scheda && Scheda._stato() && Scheda._stato().tipo === 'setDrum' ? 'setDrum' : id;
}
function apriAiuto() { if (window.Aiuto) Aiuto.apri(vistaCorrente(), { admin: !!stato.admin, drum: !!(io() && io().sigla === 'DRUM') }); }
$('btnAiuto').addEventListener('click', apriAiuto);
$('btnAiutoPalco').addEventListener('click', apriAiuto);

/* Elimina brano: solo ADMIN, doppio tocco. */
$('btnElimina').addEventListener('click', () => chiediConferma($('btnElimina'), async () => {
  if (!puoScrivere('esitoBrano') || !branoAperto) return;
  const id = branoAperto.id, titolo = branoAperto.titolo;
  try {
    const j = await chiama('eliminaBrano', { brano: id });
    if (!j.ok) return mostra('esitoBrano', 'Non eliminato: ' + j.errore, true);
    const r = risposta();
    r.brani = r.brani.filter((b) => b.id !== id);
    r.statiStudio = r.statiStudio.filter((s) => s.brano !== id);
    r.sezioni = (r.sezioni || []).filter((s) => s.brano !== id);
    r.scalette = (r.scalette || []).filter((s) => s.brano !== id);   // T7: il motore lo toglie anche dalle scalette
    r.testi = (r.testi || []).filter((s) => s.brano !== id);
    r.avvisi = (r.avvisi || []).filter((s) => s.brano !== id);
    salvaCopia(); memoria.del('branoAperto'); branoAperto = null;
    disegnaBacheca();
    vai('vRepertorio'); disegnaRepertorio();
    mostra('avvisoCodice', '');
    statoSalva('eliminato ✓', 'salvato');
    mostra('repVuoto', '"' + titolo + '" eliminato (resta traccia nello Storico).');
  } catch (e) { mostra('esitoBrano', 'Non eliminato: ' + e.message, true); }
}));


/* ---------- T3 · Struttura a sezioni ----------
 * Copia di lavoro della struttura del brano aperto; si salva TUTTA insieme (salvaStruttura) 1,5 s dopo
 * l'ultima modifica, con l'elenco delle sezioni che il telefono conosceva: il motore fa l'unione con
 * quello che nel frattempo hanno fatto gli altri. */
const sezioniTutte = () => { const r = risposta(); return (r && r.sezioni) || []; };
let struttura = { brano: null, sezioni: [], conosciute: [], aperta: null };
let timerStruttura = null, strutturaInCorso = false, strutturaDiNuovo = false, ordinatore = null;
const ATTESA_STRUTTURA_MS = 1500;
// T5: "testo" viaggia con la sezione: il motore lo usa solo per le sezioni nuove (Duplica), per le altre lo cambia salvaTesti
const CAMPI_SEZIONE = ['id', 'tipo', 'nome', 'ripetizioni', 'battute', 'bpm', 'metro', 'riferimento', 'feel', 'nota', 'chiSuona', 'testo'];
function copiaSezione(x) {
  const o = {};
  CAMPI_SEZIONE.concat(['versione', 'modificatoDa', 'modificatoIl']).forEach((k) => { o[k] = x[k] === undefined || x[k] === null ? '' : x[k]; });
  return o;
}
function perMotore(x) { const o = {}; CAMPI_SEZIONE.forEach((k) => { o[k] = x[k] === undefined || x[k] === null ? '' : x[k]; }); return o; }
function branoSalvato() { return !!(branoAperto && brani().some((b) => b.id === branoAperto.id)); }
function editorOccupato() {
  const a = document.activeElement;
  return !!(a && $('listaSezioni').contains(a) && a.tagName !== 'BUTTON');
}
/** Il brano come è scritto adesso nella scheda (serve alla durata calcolata), con la durata manuale in secondi. */
function branoPerDurata() {
  const d = leggiModuloBrano();
  const sec = Regole.leggiDurata(d.durataManuale);
  d.durataManuale = sec === null ? '' : sec;
  return d;
}

function caricaStruttura(branoId) {
  const lista = sezioniTutte().filter((x) => x.brano === branoId).sort((a, b) => a.ordine - b.ordine).map(copiaSezione);
  const aperta = struttura.brano === branoId && lista.some((x) => x.id === struttura.aperta) ? struttura.aperta : null;
  struttura = { brano: branoId, sezioni: lista, conosciute: lista.map((x) => ({ id: x.id, versione: x.versione })), aperta };
  mostra('esitoStruttura', '');
  disegnaStruttura();
}

/** Totale in testa alla struttura e confronto con la durata manuale (decisione T3 n. 4: vince la manuale). */
function aggiornaDurate() {
  if (!branoAperto) return;
  const b = branoPerDurata();
  const d = Regole.durataStruttura(b, struttura.brano === branoAperto.id ? struttura.sezioni : []);
  const t = $('strDurata'); t.textContent = ''; t.className = '';
  if (d.secondi !== null) t.append('totale ', el('b', '', Regole.scriviDurata(d.secondi)), ' calcolato');
  else if (d.sezioni) {
    t.className = 'manca';
    t.textContent = d.senzaBattute.length ? 'durata non calcolata: mancano le battute in ' + d.senzaBattute.join(', ')
      : 'durata non calcolata: manca il BPM (del brano o della sezione) in ' + d.senzaBpm.join(', ');
  }
  const c = $('bDurataConfronto'); c.textContent = '';
  if (d.secondi !== null && b.durataManuale) {
    c.append('calcolata ', el('b', '', Regole.scriviDurata(d.secondi)), ' · manuale ', el('b', '', Regole.scriviDurata(b.durataManuale)),
      ' (' + Regole.scriviDifferenza(b.durataManuale - d.secondi) + '). Vale la manuale.');
  } else if (d.secondi !== null) c.append('Calcolata dalla struttura: ', el('b', '', Regole.scriviDurata(d.secondi)), '. Vale questa finché non scrivi la manuale.');
  c.hidden = !c.textContent;
  aggiornaPulsantiMetro();
}

function testoCambi(x) {
  const p = [];
  if (x.bpm !== '' && x.bpm !== null && x.bpm !== undefined) p.push('♩ ' + x.bpm);
  if (x.metro) p.push(x.metro);
  if (x.riferimento) p.push(x.riferimento.toLowerCase());
  if (x.feel) p.push(x.feel.toLowerCase());
  return p.join(' · ');
}

/** Riga compatta: nome, ×ripetizioni, battute (se l'impostazione è accesa), cambi, eccezioni di chi suona, nota. */
function riempiCorpo(corpo, x, nome) {
  const me = io(), imp = impostazioni();
  corpo.textContent = '';
  const r1 = el('span', 'r1'); r1.append(el('b', 'nome', nome));
  if (Number(x.ripetizioni) > 1) r1.append(el('span', 'rip', '×' + x.ripetizioni));
  if (imp.battute && x.battute !== '' && x.battute !== null && x.battute !== undefined) r1.append(el('span', 'batt', x.battute + ' batt.'));
  corpo.append(r1);
  const cambi = testoCambi(x);
  if (cambi) corpo.append(el('span', 'cambi', cambi));
  const g = Regole.gruppiChiSuona(x.chiSuona);
  if (g.tacet.length || g.stella.length) {
    const chi = el('span', 'chi');
    // "Evidenzia solo la mia parte": le mie eccezioni in rilievo, quelle degli altri attenuate
    const segno = (sigla, tipo) => el('span', 'eccez ' + tipo + (imp.evidenziaSoloMe ? (me && me.sigla === sigla ? ' mia' : ' altri') : ''), (tipo === 'tacet' ? 'tacet ' : '★ ') + sigla);
    g.tacet.forEach((sg) => chi.append(segno(sg, 'tacet')));
    g.stella.forEach((sg) => chi.append(segno(sg, 'stella')));
    corpo.append(chi);
  }
  if (x.nota) corpo.append(el('span', 'nota', x.nota));
  // T5 (decisione 3A): testo completo, prima riga o niente, secondo l'impostazione personale
  const t = testoDi(x.testo), modo = imp.testiSezioni || 'Prima riga';
  if (t && modo !== 'Nascosti') {
    const i0 = struttura.sezioni.findIndex((q) => q.testo === x.testo);
    if (i0 >= 0 && struttura.sezioni[i0] !== x) corpo.append(el('span', 'condiviso', '= stesso testo di ' + Regole.nomiSezioni(struttura.sezioni)[i0]));
    corpo.append(el('span', 'testo-sez' + (modo === 'Prima riga' ? ' prima' : ''), modo === 'Prima riga' ? Regole.primaRiga(t.testo) : t.testo));
  }
}
function aggiornaRigheCompatte() {
  const nomi = Regole.nomiSezioni(struttura.sezioni);
  struttura.sezioni.forEach((x, i) => {
    const c = document.querySelector('#listaSezioni li[data-id="' + x.id + '"] button.corpo');
    if (c) riempiCorpo(c, x, nomi[i]);
  });
}

function disegnaStruttura() {
  const ul = $('listaSezioni'); ul.textContent = '';
  const nomi = Regole.nomiSezioni(struttura.sezioni), n = struttura.sezioni.length;
  struttura.sezioni.forEach((x, i) => {
    const li = el('li', 'sezione' + (struttura.aperta === x.id ? ' aperta' : '')); li.dataset.id = x.id;
    const riga = el('div', 'riga-sez');
    const maniglia = el('span', 'maniglia', '≡'); maniglia.setAttribute('aria-label', 'trascina per spostare');
    const corpo = el('button', 'corpo'); corpo.type = 'button';
    riempiCorpo(corpo, x, nomi[i]);
    corpo.addEventListener('click', () => { struttura.aperta = struttura.aperta === x.id ? null : x.id; disegnaStruttura(); });
    const frecce = el('span', 'frecce');
    const su = el('button', 'su', '▲'); su.type = 'button'; su.setAttribute('aria-label', 'sposta su'); su.disabled = i === 0;
    const giu = el('button', 'giu', '▼'); giu.type = 'button'; giu.setAttribute('aria-label', 'sposta giù'); giu.disabled = i === n - 1;
    su.addEventListener('click', () => spostaSezione(i, -1));
    giu.addEventListener('click', () => spostaSezione(i, 1));
    frecce.append(su, giu);
    // T6: "▶ da qui" non è un <button>: senza rete i pulsanti della struttura si disattivano, il metronomo no
    const dq = el('span', 'da-qui', '▶'); dq.setAttribute('role', 'button'); dq.setAttribute('aria-label', 'metronomo da questa sezione'); dq.tabIndex = 0;
    dq.addEventListener('click', () => daQui(x.id));
    riga.append(dq, maniglia, corpo, frecce); li.append(riga);
    if (struttura.aperta === x.id) li.append(editorSezione(x));
    ul.append(li);
  });
  const salvato = branoSalvato(), v = $('strVuota');
  v.textContent = !salvato ? 'Prima scrivi il titolo: poi puoi aggiungere le sezioni.'
    : !n ? (io() ? 'Ancora nessuna sezione: tocca "+ Sezione" (Intro, Strofa, Rit…) oppure "+ Testo" per crearla dal testo.' : 'Nessuna sezione.') : '';
  v.hidden = !v.textContent;
  disegnaNonCollegati();
  disegnaAvvisoBrano();
  preparaOrdinatore();
  aggiornaDurate();
  const pos = metro.posizione();
  evidenziaInCorso(pos && !pos.conteggio ? pos.sezione : null);
  aggiornaRete();
}

/** Ridisegna la struttura e rimette il cursore nel campo dove si stava scrivendo (stessa sezione, stessa posizione). */
function disegnaStrutturaTenendoIlCursore() {
  const a = document.activeElement, li = a && a.closest ? a.closest('li.sezione') : null;
  const sel = a && a.dataset ? (a.dataset.campo ? '[data-campo="' + a.dataset.campo + '"]' : a.dataset.testo ? 'textarea[data-testo]' : null) : null;
  const dove = li && sel ? { id: li.dataset.id, sel, pos: (() => { try { return a.selectionStart; } catch (e) { return null; } })() } : null;
  disegnaStruttura();
  if (!dove) return;
  const x = document.querySelector('#listaSezioni li[data-id="' + dove.id + '"] ' + dove.sel);
  if (!x) return;
  x.focus();
  try { if (dove.pos !== null && dove.pos !== undefined) x.setSelectionRange(dove.pos, dove.pos); } catch (e) { /* campi numerici: niente posizione */ }
}

/** Trascinamento con la maniglia ≡ (stessa impostazione collaudata nella T0 sullo Xiaomi). Senza libreria restano le frecce. */
function preparaOrdinatore() {
  if (!window.Sortable || ordinatore) return;
  ordinatore = Sortable.create($('listaSezioni'), {
    handle: '.maniglia', animation: 150, ghostClass: 'fantasma', draggable: 'li.sezione',
    onEnd: (e) => {
      if (e.oldIndex === e.newIndex) return;
      const [x] = struttura.sezioni.splice(e.oldIndex, 1);
      struttura.sezioni.splice(e.newIndex, 0, x);
      disegnaStruttura();
      cambioStruttura();
    }
  });
}

function editorSezione(x) {
  const box = el('div', 'editor');
  const b = branoPerDurata();
  const colonna = (etichetta, nodo, classe) => {
    const c = el('div', 'campo-col' + (classe ? ' ' + classe : ''));
    const l = el('label', 'etichetta', etichetta);
    nodo.id = 'sez-' + nodo.dataset.campo; l.htmlFor = nodo.id;
    c.append(l, nodo); return c;
  };
  const scelta = (campo, opzioni, valore) => {
    const s = document.createElement('select'); s.dataset.campo = campo;
    opzioni.forEach(([v, t]) => s.append(new Option(t, v)));
    s.value = valore === undefined || valore === null ? '' : String(valore); return s;
  };
  const casella = (campo, attributi, valore) => {
    const s = document.createElement('input'); s.dataset.campo = campo; Object.assign(s, attributi);
    s.value = valore === undefined || valore === null ? '' : valore; return s;
  };
  const r1 = el('div', 'riga-campi');
  r1.append(colonna('Tipo', scelta('tipo', Regole.TIPI_SEZIONE.map((t) => [t, t]), x.tipo)),
    colonna('Nome (facoltativo)', casella('nome', { maxLength: 40, placeholder: 'es. Strofa lenta' }, x.nome)));
  const r2 = el('div', 'riga-campi');
  const rip = el('div', 'campo-col'); rip.append(el('span', 'etichetta', 'Ripetizioni'));
  const passi = el('div', 'passi');
  const meno = el('button', 'secondario', '−'); meno.type = 'button'; meno.setAttribute('aria-label', 'una ripetizione in meno');
  const quante = el('output', '', '×' + (x.ripetizioni || 1));
  const piu = el('button', 'secondario', '+'); piu.type = 'button'; piu.setAttribute('aria-label', 'una ripetizione in più');
  const cambiaRip = (d) => {
    const nuovo = Math.max(1, Math.min(Regole.MAX_RIPETIZIONI, (Number(x.ripetizioni) || 1) + d));
    if (nuovo === Number(x.ripetizioni)) return;
    x.ripetizioni = nuovo; quante.textContent = '×' + nuovo;
    aggiornaRigheCompatte(); cambioStruttura();
  };
  meno.addEventListener('click', () => cambiaRip(-1)); piu.addEventListener('click', () => cambiaRip(1));
  passi.append(meno, quante, piu); rip.append(passi);
  r2.append(colonna('Battute', casella('battute', { type: 'number', inputMode: 'numeric', min: 1, max: Regole.MAX_BATTUTE, step: 1, placeholder: '—' }, x.battute), 'stretto'), rip);
  const nota = colonna('Nota', casella('nota', { maxLength: 200, placeholder: 'es. stop sul 4, attacca GTR1' }, x.nota));
  // Chi suona: un pulsante per membro; al tocco suona → tacet → ★ → suona
  const cs = el('div', 'chisuona'), mappa = Regole.leggiChiSuona(x.chiSuona) || {};
  Regole.SIGLE.forEach((sg) => {
    const parte = mappa[sg] || '';
    const bt = el('button', (parte === 'tacet' ? 'tacet' : parte === '★' ? 'stella' : '') + (io() && io().sigla === sg ? ' mio' : ''));
    bt.type = 'button'; bt.dataset.sigla = sg;
    bt.append(document.createTextNode(sg), el('small', '', parte || 'suona'));
    bt.addEventListener('click', () => {
      mappa[sg] = Regole.parteSuccessiva(mappa[sg]);
      x.chiSuona = Regole.scriviChiSuona(mappa);
      disegnaStruttura(); cambioStruttura();
    });
    cs.append(bt);
  });
  // Cambi della sezione (decisione T3 n. 3): vuoto = come il brano
  const cambi = document.createElement('details'); cambi.className = 'cambi';
  cambi.open = !!testoCambi(x);
  cambi.append(el('summary', '', 'Cambi in questa sezione (BPM, metro, feel)'));
  const r3 = el('div', 'riga-campi');
  r3.append(colonna('BPM', casella('bpm', { type: 'number', inputMode: 'numeric', min: Regole.BPM_MIN, max: Regole.BPM_MAX, step: 1, placeholder: b.bpm ? String(b.bpm) : '—' }, x.bpm), 'stretto'),
    colonna('Metro', scelta('metro', [['', '= brano (' + b.metro + ')']].concat(Regole.METRI.map((m) => [m, m])), x.metro)),
    colonna('Riferimento', scelta('riferimento', [['', '= brano (' + b.riferimento.toLowerCase() + ')']].concat(Regole.RIFERIMENTI.map((m) => [m, m])), x.riferimento)),
    colonna('Feel', scelta('feel', [['', '= brano (' + String(b.feel || 'Dritto').toLowerCase() + ')']].concat(Regole.FEEL.map((m) => [m, m])), x.feel)));
  cambi.append(r3);
  const azioni = el('div', 'azioni');
  const dup = el('button', 'secondario', 'Duplica'); dup.type = 'button';
  dup.addEventListener('click', () => duplicaSezione(x.id));
  const togli = el('button', 'pericolo', 'Elimina sezione'); togli.type = 'button'; togli.dataset.testo = 'Elimina sezione';
  togli.addEventListener('click', () => chiediConferma(togli, () => eliminaSezione(x.id)));
  const chiudi = el('button', 'secondario', 'Chiudi'); chiudi.type = 'button';
  chiudi.addEventListener('click', () => { struttura.aperta = null; disegnaStruttura(); });
  azioni.append(dup, togli, chiudi);
  box.append(r1, r2, nota, editorTesto(x), el('span', 'etichetta', 'Chi suona — tocca: tacet, poi ★, poi di nuovo suona'), cs, cambi, azioni);
  // Scrivendo si aggiorna la copia di lavoro e la riga compatta, senza ridisegnare il riquadro sotto le dita
  box.querySelectorAll('[data-campo]').forEach((campo) => {
    campo.addEventListener(campo.tagName === 'SELECT' ? 'change' : 'input', () => {
      const c = campo.dataset.campo;
      if (c === 'metro') {
        // come nella scheda: il riferimento si adatta solo se era ancora quello suggerito per il metro di prima
        const bb = branoPerDurata(), prima = x.metro || bb.metro, dopo = campo.value || bb.metro;
        if ((x.riferimento || bb.riferimento) === Regole.riferimentoSuggerito(prima)) {
          const sugg = Regole.riferimentoSuggerito(dopo);
          x.riferimento = sugg === bb.riferimento ? '' : sugg;
          box.querySelector('[data-campo="riferimento"]').value = x.riferimento;
        }
      }
      x[c] = campo.value;
      aggiornaRigheCompatte();
      cambioStruttura();
    });
  });
  return box;
}

function spostaSezione(i, d) {
  const j = i + d;
  if (j < 0 || j >= struttura.sezioni.length) return;
  const t = struttura.sezioni[i]; struttura.sezioni[i] = struttura.sezioni[j]; struttura.sezioni[j] = t;
  disegnaStruttura(); cambioStruttura();
}
function duplicaSezione(id) {
  const i = struttura.sezioni.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (struttura.sezioni.length >= Regole.MAX_SEZIONI) return mostra('esitoStruttura', 'Massimo ' + Regole.MAX_SEZIONI + ' sezioni per brano.', true);
  const c = copiaSezione(struttura.sezioni[i]);
  c.id = nuovoIdBrano(); c.versione = 0; c.modificatoDa = ''; c.modificatoIl = '';
  struttura.sezioni.splice(i + 1, 0, c);
  struttura.aperta = c.id;
  disegnaStruttura(); cambioStruttura();
}
function eliminaSezione(id) {
  struttura.sezioni = struttura.sezioni.filter((x) => x.id !== id);
  if (struttura.aperta === id) struttura.aperta = null;
  disegnaStruttura(); cambioStruttura();
}
$('btnSezione').addEventListener('click', () => {
  if (!puoScrivere('esitoStruttura') || !branoSalvato()) return;
  if (struttura.sezioni.length >= Regole.MAX_SEZIONI) return mostra('esitoStruttura', 'Massimo ' + Regole.MAX_SEZIONI + ' sezioni per brano.', true);
  const nuova = { id: nuovoIdBrano(), tipo: struttura.sezioni.length ? 'Strofa' : 'Intro', nome: '', ripetizioni: 1, battute: '', bpm: '', metro: '', riferimento: '', feel: '', nota: '', chiSuona: '', versione: 0, modificatoDa: '', modificatoIl: '' };
  struttura.sezioni.push(nuova);
  struttura.aperta = nuova.id;
  disegnaStruttura(); cambioStruttura();
  const li = document.querySelector('#listaSezioni li[data-id="' + nuova.id + '"]');
  if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
});

function nomeCampoSezione(c) {
  return { tipo: 'tipo', ripetizioni: 'ripetizioni (1–16)', battute: 'battute (1–999, intero)', bpm: 'BPM (30–300, intero)', metro: 'metro', riferimento: 'riferimento', feel: 'feel', chiSuona: 'chi suona', troppe: 'massimo 40 sezioni', id: 'identificativo', doppione: 'sezione doppia' }[c] || c;
}

function cambioStruttura() {
  clearTimeout(timerStruttura); timerStruttura = null;
  aggiornaDurate();
  if (!io() || !struttura.brano) return;
  if (!puoScrivere('esitoStruttura')) { statoSalva('serve la rete', 'errore'); return; }
  const n = Regole.normalizzaStruttura(struttura.sezioni.map(perMotore));
  document.querySelectorAll('#listaSezioni .invalido').forEach((x) => x.classList.remove('invalido'));
  if (n.errori.length) {
    const nomi = Regole.nomiSezioni(struttura.sezioni);
    n.errori.forEach((e) => {
      const sez = struttura.sezioni[e.indice];
      if (sez) e.campi.forEach((c) => { const x = document.querySelector('#listaSezioni li[data-id="' + sez.id + '"] [data-campo="' + c + '"]'); if (x) x.classList.add('invalido'); });
    });
    statoSalva('da correggere', 'errore');
    mostra('esitoStruttura', 'Da correggere: ' + n.errori.map((e) => (e.indice >= 0 ? nomi[e.indice] + ' — ' : '') + e.campi.map(nomeCampoSezione).join(', ')).join('; ') + '. Finché non è a posto la struttura non si salva.', true);
    return;
  }
  mostra('esitoStruttura', '');
  statoSalva('salvataggio…');
  timerStruttura = setTimeout(() => { timerStruttura = null; salvaStruttura(0); }, ATTESA_STRUTTURA_MS);
}

function testoAvviso(a) {
  const parti = [];
  if (a.tenute) parti.push(a.tenute === 1 ? 'ho tenuto in fondo 1 sezione che avevano aggiunto' : 'ho tenuto in fondo ' + a.tenute + ' sezioni che avevano aggiunto');
  if (a.cambiateDaAltri) parti.push(a.cambiateDaAltri === 1 ? '1 sezione era stata modificata: ora vale la tua versione' : a.cambiateDaAltri + ' sezioni erano state modificate: ora vale la tua versione');
  if (a.ricreate) parti.push(a.ricreate === 1 ? '1 sezione che era stata tolta è tornata, perché c’era ancora nella tua' : a.ricreate + ' sezioni che erano state tolte sono tornate, perché c’erano ancora nella tua');
  return 'Attenzione: ' + (a.modificatoDa || 'un altro') + ' ha modificato la struttura' + (a.modificatoIl ? ' il ' + dataOra(a.modificatoIl) : '') + '. ' + parti.join('; ') + '. Controllate insieme.';
}

/** Salvataggio in sottofondo, uno alla volta; se nel frattempo cambia qualcosa, si risalva subito dopo. */
async function salvaStruttura(tentativo) {
  if (strutturaInCorso) { strutturaDiNuovo = true; return; }
  if (!struttura.brano) return;
  const lista = struttura.sezioni.map(perMotore);
  if (Regole.normalizzaStruttura(lista).errori.length) return;
  strutturaInCorso = true;
  const branoId = struttura.brano, conosciute = struttura.conosciute;
  const note = {}; lista.forEach((x) => { note[x.id] = true; }); conosciute.forEach((x) => { note[x.id] = true; });
  try {
    const j = await chiama('salvaStruttura', { brano: branoId, sezioni: lista, conosciute });
    if (!j.ok) {
      statoSalva('non salvato', 'errore');
      mostra('esitoStruttura', 'Struttura non salvata: ' + (j.sezioni ? j.sezioni.map((e) => e.campi.map(nomeCampoSezione).join(', ')).join('; ') : erroreSalvataggio(j)), true);
      return;
    }
    const r = risposta();
    r.sezioni = (r.sezioni || []).filter((x) => x.brano !== branoId).concat(j.sezioni);
    salvaCopia();
    if (struttura.brano === branoId) {
      struttura.conosciute = j.sezioni.map((x) => ({ id: x.id, versione: x.versione }));
      // (non ovvio) si aggiornano gli oggetti esistenti invece di sostituirli: il riquadro aperto continua a
      // scrivere sulla stessa sezione. Le sezioni che il motore ha tenuto perché aggiunte da altri si accodano.
      const locali = {}; struttura.sezioni.forEach((x) => { locali[x.id] = x; });
      let accodate = 0;
      j.sezioni.forEach((x) => {
        if (locali[x.id]) Object.assign(locali[x.id], { versione: x.versione, modificatoDa: x.modificatoDa, modificatoIl: x.modificatoIl });
        else if (!note[x.id]) { struttura.sezioni.push(copiaSezione(x)); accodate++; }
      });
      if (!editorOccupato()) disegnaStruttura();
      else if (accodate) disegnaStrutturaTenendoIlCursore();   // le sezioni degli altri si vedono subito
      else aggiornaDurate();
    }
    statoSalva('salvato ✓', 'salvato');
    if (j.avviso) mostra('esitoStruttura', testoAvviso(j.avviso), true);
  } catch (e) {
    if (e instanceof ErroreRete && tentativo < 2 && navigator.onLine) {
      statoSalva('riprovo…');
      strutturaInCorso = false;
      setTimeout(() => salvaStruttura(tentativo + 1), tentativo ? 5000 : 2000);
      return;
    }
    statoSalva('non salvato: serve la rete', 'errore');
    mostra('esitoStruttura', 'Struttura non salvata: ' + e.message + '. Le modifiche restano su questa schermata finché non la lasci.', true);
  } finally {
    strutturaInCorso = false;
    if (strutturaDiNuovo) { strutturaDiNuovo = false; salvaStruttura(0); }
  }
}

/* ---------- T5 · Testi ----------
 * Sezioni.testo = id di un testo; un ritornello identico è un solo testo collegato a più sezioni (1A).
 * Correzioni dal riquadro della sezione (salvate 1,5 s dopo l'ultima lettera); testo nuovo da "+ Testo"
 * (incolla, foto, dettatura) con la schermata di controllo, che apre l'avviso in bacheca. */
const testiTutti = () => { const r = risposta(); return (r && r.testi) || []; };
const avvisiTutti = () => { const r = risposta(); return (r && r.avvisi) || []; };
const testoDi = (id) => (id ? testiTutti().find((t) => t.id === id) : null);
const testiDelBrano = (id) => testiTutti().filter((t) => t.brano === id);
let timerTesto = null, testoInCorso = false, testoDaRisalvare = null;

/** Dopo salvaTesti: testi e sezioni del brano come li ha il motore; la copia di lavoro della struttura si allinea
 *  (versioni e collegamenti), così il prossimo salvataggio della struttura non vede "modifiche di altri". */
function applicaRispostaTesti(j) {
  const r = risposta();
  r.testi = testiTutti().filter((t) => t.brano !== j.brano).concat(j.testi);
  r.sezioni = sezioniTutte().filter((x) => x.brano !== j.brano).concat(j.sezioni);
  if (j.avvisoBacheca) { r.avvisi = avvisiTutti().filter((a) => a.id !== j.avvisoBacheca.id).concat([j.avvisoBacheca]); }
  salvaCopia();
  if (struttura.brano === j.brano) {
    const locali = {}; struttura.sezioni.forEach((x) => { locali[x.id] = x; });
    j.sezioni.forEach((x) => { if (locali[x.id]) Object.assign(locali[x.id], { testo: x.testo, versione: x.versione, modificatoDa: x.modificatoDa, modificatoIl: x.modificatoIl }); });
    const k = {}; struttura.conosciute.forEach((c) => { k[c.id] = c; });
    j.sezioni.forEach((x) => { if (k[x.id]) k[x.id].versione = x.versione; else if (locali[x.id]) struttura.conosciute.push({ id: x.id, versione: x.versione }); });
  }
  disegnaBacheca();
}

/** Sezioni del brano aperto che usano il testo (per "cambia anche in"). */
function sezioniCon(testoId) {
  const nomi = Regole.nomiSezioni(struttura.sezioni);
  return struttura.sezioni.map((x, i) => ({ x, nome: nomi[i] })).filter((o) => o.x.testo === testoId);
}

/** Correzione di un testo (o primo testo di una sezione): un salvataggio alla volta, l'ultimo vince. */
function cambioTesto(dati) {
  clearTimeout(timerTesto); timerTesto = null;
  if (!puoScrivere('esitoStruttura')) { statoSalva('serve la rete', 'errore'); return; }
  if (!Regole.testoDaSalvare(dati.testo)) { statoSalva('testo vuoto', 'errore'); mostra('esitoStruttura', 'Il testo è vuoto: non lo salvo. Per toglierlo dalla sezione tocca "Togli il testo".', true); return; }
  mostra('esitoStruttura', '');
  statoSalva('salvataggio…');
  testoDaRisalvare = dati;
  timerTesto = setTimeout(() => { timerTesto = null; salvaTestoSingolo(0); }, ATTESA_STRUTTURA_MS);
}
async function salvaTestoSingolo(tentativo) {
  if (testoInCorso || !testoDaRisalvare) return;
  const d = testoDaRisalvare; testoDaRisalvare = null;
  const t = testoDi(d.id);
  testoInCorso = true;
  try {
    const j = await chiama('salvaTesti', { brano: d.brano, testi: [{ id: d.id, etichetta: '', testo: d.testo, versione: t && t.versione ? t.versione : undefined }], collegamenti: d.sezione ? [{ sezione: d.sezione, testo: d.id }] : [] });
    if (!j.ok) { statoSalva('non salvato', 'errore'); mostra('esitoStruttura', 'Testo non salvato: ' + erroreSalvataggio(j), true); return; }
    applicaRispostaTesti(j);
    statoSalva('salvato ✓', 'salvato');
    if (j.avvisoTesti) mostra('esitoStruttura', 'Attenzione: ' + j.avvisoTesti.modificatoDa + ' aveva modificato questo testo il ' + dataOra(j.avvisoTesti.modificatoIl) + '. Hai salvato la tua versione: controllate insieme.', true);
    if (!editorOccupato()) disegnaStruttura(); else aggiornaRigheCompatte();
  } catch (e) {
    if (e instanceof ErroreRete && tentativo < 2 && navigator.onLine) {
      testoDaRisalvare = testoDaRisalvare || d; testoInCorso = false;
      statoSalva('riprovo…'); setTimeout(() => salvaTestoSingolo(tentativo + 1), tentativo ? 5000 : 2000); return;
    }
    statoSalva('non salvato: serve la rete', 'errore');
    mostra('esitoStruttura', 'Testo non salvato: ' + e.message + '. Resta su questa schermata finché non la lasci.', true);
  } finally {
    testoInCorso = false;
    if (testoDaRisalvare && !timerTesto) salvaTestoSingolo(0);
  }
}

/** Collegamenti e testi in una chiamata (Rendi indipendente, Togli, Collega, Elimina non collegato). */
async function salvaCollegamenti(dati, ok) {
  if (!puoScrivere('esitoStruttura')) return;
  statoSalva('salvataggio…');
  try {
    const j = await chiama('salvaTesti', Object.assign({ brano: struttura.brano }, dati));
    if (!j.ok) { statoSalva('non salvato', 'errore'); return mostra('esitoStruttura', 'Non salvato: ' + erroreSalvataggio(j), true); }
    applicaRispostaTesti(j);
    statoSalva('salvato ✓', 'salvato');
    if (ok) mostra('esitoStruttura', ok);
    disegnaStruttura();
  } catch (e) { statoSalva('non salvato', 'errore'); mostra('esitoStruttura', 'Non salvato: ' + e.message, true); }
}

/** Riquadro "Testo" dentro il riquadro di modifica della sezione. */
function editorTesto(x) {
  const box = el('div', 'testo-editor');
  const t = testoDi(x.testo);
  box.append(el('span', 'etichetta', 'Testo'));
  const ta = document.createElement('textarea');
  ta.dataset.testo = '1'; ta.maxLength = Regole.MAX_TESTO; ta.spellcheck = false; ta.autocapitalize = 'sentences';
  ta.rows = Math.min(12, Math.max(3, ((t && t.testo) || '').split('\n').length + 1));
  ta.placeholder = x.versione ? 'Scrivi o detta il testo di questa sezione (microfono della tastiera)' : 'La sezione si sta salvando: tra un attimo puoi scrivere il testo';
  ta.disabled = !x.versione;
  ta.value = t ? t.testo : '';
  let id = t ? t.id : null;
  ta.addEventListener('input', () => {
    const nuovo = !id;
    if (nuovo) id = nuovoIdBrano();
    let obj = testoDi(id);
    if (!obj) { obj = { id, brano: struttura.brano, versione: 0, etichetta: '', testo: '' }; risposta().testi = testiTutti().concat([obj]); x.testo = id; }
    obj.testo = ta.value;
    aggiornaRigheCompatte();
    cambioTesto({ id, brano: struttura.brano, testo: ta.value, sezione: nuovo || !obj.versione ? x.id : null });
  });
  box.append(ta);
  const azioni = el('div', 'azioni');
  if (t) {
    const altre = sezioniCon(t.id).filter((o) => o.x.id !== x.id);
    if (altre.length) {
      box.append(el('p', 'condiviso-info', 'Stesso testo anche in: ' + altre.map((o) => o.nome).join(', ') + '. Correggendolo qui cambia anche lì.'));
      const ind = el('button', 'secondario', 'Rendi indipendente'); ind.type = 'button';
      ind.addEventListener('click', () => {
        const nid = nuovoIdBrano();
        salvaCollegamenti({ testi: [{ id: nid, etichetta: '', testo: t.testo }], collegamenti: [{ sezione: x.id, testo: nid }] }, 'Ora questa sezione ha un testo suo: puoi cambiarlo senza toccare le altre.');
      });
      azioni.append(ind);
    }
    const togli = el('button', 'pericolo', 'Togli il testo'); togli.type = 'button'; togli.dataset.testo = 'Togli il testo';
    togli.addEventListener('click', () => chiediConferma(togli, () => salvaCollegamenti({ collegamenti: [{ sezione: x.id, testo: '' }] }, altre.length ? 'Testo tolto da questa sezione (resta nelle altre).' : 'Testo tolto: lo trovi in fondo, tra i "Testi non collegati".')));
    azioni.append(togli);
  } else {
    const altri = testiDelBrano(struttura.brano);
    if (altri.length) {
      const s = document.createElement('select'); s.className = 'usa-testo';
      s.append(new Option('… oppure usa un testo già scritto', ''));
      const nomi = Regole.nomiSezioni(struttura.sezioni);
      altri.forEach((o) => {
        const dove = struttura.sezioni.map((q, i) => (q.testo === o.id ? nomi[i] : null)).filter(Boolean);
        s.append(new Option((dove.length ? dove[0] + ': ' : '') + Regole.primaRiga(o.testo), o.id));
      });
      s.disabled = !x.versione;
      s.addEventListener('change', () => { if (s.value) salvaCollegamenti({ collegamenti: [{ sezione: x.id, testo: s.value }] }, 'Collegato: è lo stesso testo, correggendolo cambia ovunque.'); });
      box.append(s);
    }
  }
  if (azioni.childNodes.length) box.append(azioni);
  return box;
}

/** Testi del brano che nessuna sezione usa (5A): si ricollegano o si eliminano. */
function disegnaNonCollegati() {
  const box = $('nonCollegati'), ul = $('listaNonCollegati'); ul.textContent = '';
  if (!struttura.brano) { box.hidden = true; return; }
  const usati = new Set(struttura.sezioni.map((x) => x.testo).filter(Boolean));
  const liberi = testiDelBrano(struttura.brano).filter((t) => !usati.has(t.id) && t.versione);
  box.hidden = !liberi.length;
  const nomi = Regole.nomiSezioni(struttura.sezioni);
  liberi.forEach((t) => {
    const li = el('li');
    li.append(el('span', 'prima', Regole.primaRiga(t.testo)));
    const s = document.createElement('select');
    s.append(new Option('Collega a…', ''));
    struttura.sezioni.forEach((x, i) => { if (x.versione) s.append(new Option(nomi[i] + (x.testo ? ' (sostituisce il suo)' : ''), x.id)); });
    s.addEventListener('change', () => { if (s.value) salvaCollegamenti({ collegamenti: [{ sezione: s.value, testo: t.id }] }, 'Testo ricollegato.'); });
    const b = el('button', 'pericolo', 'Elimina'); b.type = 'button'; b.dataset.testo = 'Elimina';
    b.addEventListener('click', () => chiediConferma(b, () => salvaCollegamenti({ eliminati: [{ id: t.id, versione: t.versione }] }, 'Testo eliminato (resta traccia nello Storico).')));
    li.append(s, b); ul.append(li);
  });
}

/* ---------- T5 · Inserimento di un testo nuovo: incolla, foto, dettatura → controllo → conferma ---------- */
let ins = null;   // { brano, analisi, conStruttura, righe: [{ blocco, tipo, ripetizioni, dest }], intro, finale }

function apriInserimento() {
  if (!branoSalvato() || !puoScrivere('esitoStruttura')) return;
  if (timerStruttura) { clearTimeout(timerStruttura); timerStruttura = null; salvaStruttura(0); }
  ins = { brano: branoAperto.id, analisi: null };
  $('testoPerBrano').textContent = ($('bTitolo').value.trim() || branoAperto.titolo) + (struttura.sezioni.length ? ' · i blocchi andranno nelle sezioni che ci sono già' : ' · la struttura verrà creata dal testo');
  $('tGrezzo').value = '';
  $('tFotoInfo').textContent = '';
  mostra('esitoTesto', ''); mostra('esitoControllo', '');
  $('passoInserisci').hidden = false; $('passoControllo').hidden = true;
  const sel = $('tLingua');
  if (!sel.options.length) Regole.LINGUE_OCR.forEach((l) => sel.append(new Option('Lingua della foto: ' + l.etichetta, l.valore)));
  sel.value = memoria.get('linguaOcr') || 'it';
  vai('vTesto');
}
$('tLingua').addEventListener('change', () => memoria.set('linguaOcr', $('tLingua').value));

/** Foto ridotta sul telefono (lato lungo 2000 px, JPEG): ~0,5 MB invece di 4–8 MB, si manda anche con poca rete. */
async function riduciFoto(file) {
  const img = await createImageBitmap(file);
  const lato = Math.max(img.width, img.height), k = Math.min(1, 2000 / lato);
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  const url = await new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = ko; fr.readAsDataURL(blob); });
  return { base64: String(url).split(',')[1], kb: Math.round(blob.size / 1024) };
}
$('tFoto').addEventListener('change', async (ev) => {
  const files = Array.from(ev.target.files || []); ev.target.value = '';
  if (!files.length) return;
  if (!puoScrivere('esitoTesto')) return;
  for (let i = 0; i < files.length; i++) {
    $('tFotoInfo').textContent = 'Leggo la foto' + (files.length > 1 ? ' ' + (i + 1) + ' di ' + files.length : '') + '…';
    try {
      const f = await riduciFoto(files[i]);
      const j = await chiama('ocr', { base64: f.base64, mime: 'image/jpeg', lingua: $('tLingua').value });
      if (!j.ok) { $('tFotoInfo').textContent = ''; mostra('esitoTesto', 'Foto non letta (' + (j.dettaglio || j.errore) + '). Riprova o incolla il testo.', true); continue; }
      const prima = $('tGrezzo').value.replace(/\s+$/, '');
      $('tGrezzo').value = (prima ? prima + '\n\n' : '') + j.testo;
      $('tFotoInfo').textContent = 'Foto letta ✓ (' + f.kb + ' KB, ' + (j.msTotale / 1000).toFixed(1) + ' s). Controlla il testo: le righe vuote dividono le strofe. Puoi aggiungere un\'altra pagina.';
      mostra('esitoTesto', '');
    } catch (e) { $('tFotoInfo').textContent = ''; mostra('esitoTesto', 'Foto non letta: ' + e.message, true); }
  }
});

$('btnDividi').addEventListener('click', () => {
  const a = Regole.analizzaTesto($('tGrezzo').value);
  if (!a.blocchi.some((b) => !b.strumentale)) return mostra('esitoTesto', 'Non c\'è testo da dividere.', true);
  mostra('esitoTesto', '');
  ins.analisi = a;
  ins.conStruttura = struttura.brano === ins.brano && struttura.sezioni.length > 0;
  ins.intro = false; ins.finale = false;
  ins.proposte = null; ins.proposteDa = null;   // (difetto T5 trovato nella T6) dopo "Torna al testo" restavano i tipi della divisione di prima
  if (ins.conStruttura) {
    const dest = Regole.abbinaAStruttura(a, struttura.sezioni);
    ins.righe = a.blocchi.map((b, i) => ({ blocco: i, tipo: b.tipo, ripetizioni: b.ripetizioni, dest: dest[i] })).filter((r) => !a.blocchi[r.blocco].strumentale);
  } else ins.righe = null;
  $('passoInserisci').hidden = true; $('passoControllo').hidden = false;
  disegnaControllo();
  window.scrollTo(0, 0);
});
$('btnModificaTesto').addEventListener('click', () => { $('passoInserisci').hidden = false; $('passoControllo').hidden = true; });
$('btnTestoIndietro').addEventListener('click', () => { ins = null; vai('vBrano'); });

/** Righe della struttura proposta (brano senza struttura), ricalcolate quando cambiano i segnaposto. */
function righeProposte() {
  if (!ins.proposte || ins.proposteDa !== String(ins.intro) + ins.finale) {
    const vecchie = ins.proposte || [];
    ins.proposte = Regole.proponiStruttura(ins.analisi, { intro: ins.intro, finale: ins.finale }).map((p) => {
      const v = vecchie.find((q) => q.blocco === p.blocco && q.blocco >= 0);
      return v ? Object.assign(p, { tipo: v.tipo, ripetizioni: v.ripetizioni }) : p;
    });
    ins.proposteDa = String(ins.intro) + ins.finale;
  }
  return ins.proposte;
}

function disegnaControllo() {
  const a = ins.analisi, ul = $('listaBlocchi'); ul.textContent = '';
  const info = [a.blocchi.filter((b) => !b.strumentale).length + ' blocchi di testo'];
  if (a.accordiTolti) info.push('tolte ' + a.accordiTolti + (a.accordiTolti === 1 ? ' riga di accordi' : ' righe di accordi'));
  if (a.etichette) info.push(a.etichette + (a.etichette === 1 ? ' etichetta usata' : ' etichette usate') + ' (Rit, Strofa, x2…)');
  $('tRiepilogo').textContent = info.join(' · ') + '.';
  $('tAvvisoRighe').hidden = !a.senzaRigheVuote;
  $('tSegnaposto').hidden = ins.conStruttura;
  $('tIntro').checked = !!ins.intro; $('tFinale').checked = !!ins.finale;
  const tipoSel = (val, onCambia) => {
    const s = document.createElement('select'); s.className = 'tipo';
    Regole.TIPI_SEZIONE.forEach((t) => s.append(new Option(t, t))); s.value = val;
    s.addEventListener('change', () => onCambia(s.value)); return s;
  };
  const passi = (val, onCambia) => {
    const p = el('div', 'passi');
    const meno = el('button', 'secondario', '−'); meno.type = 'button'; meno.setAttribute('aria-label', 'una ripetizione in meno');
    const o = el('output', '', '×' + val);
    const piu = el('button', 'secondario', '+'); piu.type = 'button'; piu.setAttribute('aria-label', 'una ripetizione in più');
    meno.addEventListener('click', () => onCambia(Math.max(1, val - 1))); piu.addEventListener('click', () => onCambia(Math.min(Regole.MAX_RIPETIZIONI, val + 1)));
    p.append(meno, o, piu); return p;
  };
  /** (correzione rimandata dalla T5) il riferimento usa il numero della RIGA mostrata e il suo tipo, es. "riga 4 (Rit)":
   *  con "aggiungi un Intro in testa" le righe scalano di uno e il numero del blocco analizzato non corrisponde più. */
  const rigaDi = (j) => {
    if (!ins.conStruttura) {
      const lista = righeProposte(), n = lista.findIndex((p) => p.blocco === j);
      return n >= 0 ? 'riga ' + (n + 1) + ' (' + lista[n].tipo + ')' : 'riga ' + (j + 1);
    }
    const r = ins.righe.find((x) => x.blocco === j);
    return 'riga ' + (j + 1) + (r ? ' (' + r.tipo + ')' : '');
  };
  const corpoTesto = (b, i) => {
    const box = el('div', 'blocco-testo');
    if (b.strumentale) { box.append(el('span', 'tenue', 'strumentale: nessun testo')); return box; }
    const prec = a.blocchi.findIndex((x, j) => j < i && x.gruppo === b.gruppo);
    if (prec >= 0) box.append(el('span', 'uguale', '= stesso testo della ' + rigaDi(prec)));
    else box.append(el('pre', '', b.testo));
    if (b.quasiUgualeA >= 0 && prec < 0) {
      const q = el('div', 'quasi');
      q.append(el('span', '', '≈ quasi uguale alla ' + rigaDi(b.quasiUgualeA) + ': lo tengo separato. '));
      const u = el('button', 'secondario', 'Usa lo stesso testo'); u.type = 'button';
      u.addEventListener('click', () => { const g = a.blocchi[b.quasiUgualeA].gruppo; a.blocchi.forEach((x) => { if (x.gruppo === b.gruppo) { x.gruppo = g; x.testo = a.blocchi[b.quasiUgualeA].testo; } }); b.quasiUgualeA = -1; disegnaControllo(); });
      q.append(u); box.append(q);
    }
    return box;
  };
  if (!ins.conStruttura) {
    righeProposte().forEach((p, n) => {
      const li = el('li', 'blocco' + (p.blocco < 0 ? ' segnaposto' : ''));
      const testa = el('div', 'testa-blocco');
      testa.append(el('b', 'num', String(n + 1)), tipoSel(p.tipo, (v) => { p.tipo = v; disegnaControllo(); }), passi(p.ripetizioni, (v) => { p.ripetizioni = v; disegnaControllo(); }));
      li.append(testa, p.blocco >= 0 ? corpoTesto(a.blocchi[p.blocco], p.blocco) : el('div', 'blocco-testo tenue', p.tipo === 'Intro' || p.tipo === 'Finale' ? 'segnaposto senza testo (battute da scrivere)' : 'strumentale: nessun testo'));
      ul.append(li);
    });
  } else {
    const nomi = Regole.nomiSezioni(struttura.sezioni);
    ins.righe.forEach((r, n) => {
      const b = a.blocchi[r.blocco];
      const li = el('li', 'blocco');
      const testa = el('div', 'testa-blocco');
      const s = document.createElement('select'); s.className = 'dest';
      struttura.sezioni.forEach((x, i) => s.append(new Option('→ ' + nomi[i] + (x.testo ? ' (sostituisce il suo testo)' : ''), x.id)));
      s.append(new Option('→ Nuova sezione in fondo', 'nuova'));
      s.append(new Option('→ Non inserire', ''));
      s.value = r.dest;
      s.addEventListener('change', () => { r.dest = s.value; disegnaControllo(); });
      testa.append(el('b', 'num', String(r.blocco + 1)), s);
      if (r.dest === 'nuova') testa.append(tipoSel(r.tipo, (v) => { r.tipo = v; disegnaControllo(); }), passi(r.ripetizioni, (v) => { r.ripetizioni = v; disegnaControllo(); }));
      li.append(testa, corpoTesto(b, r.blocco));
      ul.append(li);
    });
  }
  $('btnConferma').disabled = senzaRete();
}
$('tIntro').addEventListener('change', () => { ins.intro = $('tIntro').checked; disegnaControllo(); });
$('tFinale').addEventListener('change', () => { ins.finale = $('tFinale').checked; disegnaControllo(); });

$('btnConferma').addEventListener('click', async () => {
  if (!ins || !ins.analisi || !puoScrivere('esitoControllo')) return;
  const a = ins.analisi, idGruppo = {}, testi = [];
  const testoDelGruppo = (g) => {
    if (g < 0) return '';
    if (!idGruppo[g]) { idGruppo[g] = nuovoIdBrano(); testi.push({ id: idGruppo[g], etichetta: '', testo: a.blocchi.find((b) => b.gruppo === g).testo }); }
    return idGruppo[g];
  };
  const dati = { brano: ins.brano, nuovo: true, testi, collegamenti: [], sezioniNuove: [] };
  if (!ins.conStruttura) {
    righeProposte().forEach((p) => dati.sezioniNuove.push({ id: nuovoIdBrano(), tipo: p.tipo, nome: '', ripetizioni: p.ripetizioni, battute: '', testo: p.blocco >= 0 ? testoDelGruppo(a.blocchi[p.blocco].gruppo) : '' }));
    dati.tipoAvviso = 'struttura dal testo';
  } else {
    ins.righe.forEach((r) => {
      if (!r.dest) return;
      const id = testoDelGruppo(a.blocchi[r.blocco].gruppo);
      if (r.dest === 'nuova') dati.sezioniNuove.push({ id: nuovoIdBrano(), tipo: r.tipo, nome: '', ripetizioni: r.ripetizioni, battute: '', testo: id });
      else dati.collegamenti.push({ sezione: r.dest, testo: id });
    });
    dati.tipoAvviso = dati.sezioniNuove.length ? 'sezioni in fondo' : 'testo abbinato';
  }
  if (!testi.length && !dati.sezioniNuove.length) return mostra('esitoControllo', 'Non c\'è niente da inserire: scegli almeno una sezione.', true);
  if (struttura.sezioni.length + dati.sezioniNuove.length > Regole.MAX_SEZIONI) return mostra('esitoControllo', 'Diventerebbero più di ' + Regole.MAX_SEZIONI + ' sezioni: togli qualche blocco.', true);
  $('btnConferma').disabled = true; statoSalva('salvataggio…'); mostra('esitoControllo', 'Salvo il testo…');
  try {
    const j = await chiama('salvaTesti', dati);
    if (!j.ok) { statoSalva('non salvato', 'errore'); $('btnConferma').disabled = false; return mostra('esitoControllo', 'Non salvato: ' + erroreSalvataggio(j), true); }
    applicaRispostaTesti(j);
    statoSalva('salvato ✓', 'salvato');
    const brano = ins.brano; ins = null;
    if (branoAperto && branoAperto.id === brano) { caricaStruttura(brano); vai('vBrano'); }
    mostra('esitoStruttura', 'Testo inserito ✓ ' + (j.avvisoBacheca ? j.avvisoBacheca.testo + ' L\'avviso è in bacheca (Inizio) finché qualcuno tocca "Sistemato".' : ''));
    const r = $('riquadroStruttura'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'start' });
  } catch (e) { statoSalva('non salvato', 'errore'); $('btnConferma').disabled = false; mostra('esitoControllo', 'Non salvato: ' + e.message + '. Il testo resta qui.', true); }
});

/* ---------- T5 · Leggi tutto il testo (sola lettura, anche senza rete) ---------- */
function apriLettura() {
  if (!branoAperto) return;
  $('letturaTitolo').textContent = $('bTitolo').value.trim() || branoAperto.titolo || 'Testo';
  const box = $('letturaTesto'); box.textContent = '';
  const nomi = Regole.nomiSezioni(struttura.sezioni);
  if (!struttura.sezioni.length) box.append(el('p', 'tenue', 'Ancora nessuna sezione.'));
  struttura.sezioni.forEach((x, i) => {
    const t = testoDi(x.testo), d = el('div', 'sez-lettura' + (t ? '' : ' senza'));
    d.append(el('h3', '', nomi[i] + (Number(x.ripetizioni) > 1 ? ' ×' + x.ripetizioni : '')));
    if (t) d.append(el('p', 'parole', t.testo));
    box.append(d);
  });
  vai('vLettura');
}
$('btnLettura').addEventListener('click', apriLettura);
$('btnLetturaIndietro').addEventListener('click', () => vai('vBrano'));
$('btnTesto').addEventListener('click', apriInserimento);

/* ---------- T5 · Bacheca: "Da sistemare" e "Ultimi 7 giorni" (decisioni 6A, 7B, 8A) ---------- */
function adessoLocale() {
  const d = new Date(), z = (x) => ('0' + x).slice(-2);
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
}
/** Chi ha toccato la struttura DOPO l'avviso (solo un aiuto: l'avviso si chiude con "Sistemato"). */
function modificataDopo(av) {
  let ultimo = null;
  sezioniTutte().forEach((x) => { if (x.brano === av.brano && String(x.modificatoIl) > av.apertoIl && (!ultimo || String(x.modificatoIl) > String(ultimo.modificatoIl))) ultimo = x; });
  return ultimo;
}
const avvisiAperti = () => avvisiTutti().filter((a) => !a.chiusoIl && a.tipo !== 'nuovo brano' && brani().some((b) => b.id === a.brano)).sort((a, b) => (a.apertoIl < b.apertoIl ? 1 : -1));

function rigaAvviso(av, conTitolo) {
  const b = brani().find((x) => x.id === av.brano);
  const li = el('li', 'avviso-riga'); li.dataset.avviso = av.id;
  const apri = el('button', 'apri'); apri.type = 'button';
  if (conTitolo) apri.append(el('b', '', b ? b.titolo : ''));
  apri.append(el('span', 'cosa', 'Testo aggiunto da ' + av.apertoDa + ' il ' + ora(av.apertoIl) + '. ' + av.testo));
  const dopo = modificataDopo(av);
  if (dopo) apri.append(el('span', 'dopo', dopo.modificatoDa + ' ha modificato la struttura dopo l\'avviso (' + ora(dopo.modificatoIl) + ').'));
  if (conTitolo) apri.addEventListener('click', () => { apriBrano(av.brano); const r = $('riquadroStruttura'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'start' }); });
  li.append(apri);
  if (io()) {
    const s = el('button', 'sistemato', 'Sistemato'); s.type = 'button';
    s.disabled = senzaRete();
    s.addEventListener('click', () => sistemato(av.id));
    li.append(s);
  }
  return li;
}

/** Variante T8-bis-2: serate da collegare (solo ADMIN). Calcolata ogni volta dai dati: sparisce da sola quando è a posto. */
function disegnaDaCollegare() {
  const box = $('riquadroDaCollegare'), ul = $('listaDaCollegare'); if (!box) return;
  ul.textContent = '';
  const r = risposta();
  if (!stato.admin || !r) { box.hidden = true; return; }
  const schede = (r.schede || []).concat((r.schedeIndice || []).filter((x) => !(r.schede || []).some((k) => k.id === x.id)));
  const righe = Regole.serateDaCollegare(r.serate || [], schede, r.locali || [], oggiLocale());
  righe.forEach((x) => {
    const li = el('li'); const b = el('button', 'apri'); b.type = 'button'; b.dataset.id = x.id;
    b.append(el('b', '', Regole.scriviData(x.data, true) + (x.locale ? ' · ' + x.locale : '')), el('span', 'cosa', x.problemi.join(' · ')));
    b.addEventListener('click', () => apriSerata(x.id));
    li.append(b); ul.append(li);
  });
  box.hidden = !righe.length;
}
function disegnaBacheca() {
  disegnaDaCollegare();
  const ul = $('listaDaSistemare'); if (!ul) return;
  ul.textContent = '';
  const aperti = avvisiAperti();
  aperti.forEach((av) => ul.append(rigaAvviso(av, true)));
  $('nienteDaSistemare').hidden = aperti.length > 0;
  // Ultimi 7 giorni: brani nuovi, testi aggiunti, strutture sistemate, con chi (nessuna classifica)
  const dal = Regole.giorniPrima(adessoLocale(), Regole.GIORNI_NOVITA), voci = [];
  avvisiTutti().forEach((a) => {
    const b = brani().find((x) => x.id === a.brano); if (!b) return;
    if (a.tipo === 'nuovo brano') { if (a.apertoIl >= dal) voci.push({ quando: a.apertoIl, brano: b, testo: 'nuovo brano, aggiunto da ' + a.apertoDa }); return; }
    if (a.apertoIl >= dal) voci.push({ quando: a.apertoIl, brano: b, testo: 'testo aggiunto da ' + a.apertoDa });
    if (a.chiusoIl && a.chiusoIl >= dal) voci.push({ quando: a.chiusoIl, brano: b, testo: 'struttura sistemata da ' + a.chiusoDa });
  });
  voci.sort((x, y) => (x.quando < y.quando ? 1 : -1));
  const un = $('listaNovita'); un.textContent = '';
  voci.slice(0, 15).forEach((v) => {
    const li = el('li'); const btn = el('button', 'apri'); btn.type = 'button';
    btn.append(el('b', '', v.brano.titolo), el('span', 'cosa', v.testo + ' · ' + ora(v.quando)));
    btn.addEventListener('click', () => apriBrano(v.brano.id));
    li.append(btn); un.append(li);
  });
  $('nienteNovita').hidden = voci.length > 0;
}

/** Stessa riga dell'avviso in cima alla struttura del brano aperto. */
function disegnaAvvisoBrano() {
  const box = $('avvisoBrano'); box.textContent = '';
  const av = branoAperto && avvisiAperti().find((a) => a.brano === branoAperto.id);
  box.hidden = !av;
  if (!av) return;
  const ul = el('ul', 'bacheca'); ul.append(rigaAvviso(av, false)); box.append(ul);
}

async function sistemato(id) {
  if (!puoScrivere('avvisoCodice')) return;
  statoSalva('salvataggio…');
  try {
    const j = await chiama('sistemato', { avviso: id });
    if (!j.ok) { statoSalva('non salvato', 'errore'); return; }
    const r = risposta();
    r.avvisi = avvisiTutti().filter((a) => a.id !== id).concat([j.avviso]);
    salvaCopia();
    statoSalva(j.gia ? 'già sistemato da ' + j.avviso.chiusoDa : 'salvato ✓', 'salvato');
    disegnaBacheca();
    if (branoAperto) disegnaAvvisoBrano();
  } catch (e) { statoSalva('non salvato', 'errore'); }
}

/* ---------- T6 · Metronomo ----------
 * Due modi di partire: dalla scheda del brano (segue la struttura, o libero con il motivo) e dalla schermata
 * Metronomo (da solo, valori ricordati solo su questo telefono). Una sola barra in basso mentre suona.
 * Si ferma uscendo dal brano (non passando a "Leggi tutto il testo"), uscendo dalla schermata Metronomo e
 * quando l'app va in background (decisione B1: meglio fermo che a tempo sbagliato). */
const metro = Metronomo.crea();
const bpmTesto = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
let metroDove = null;          // 'brano' | 'solo' | null
let metroBrano = null;         // id del brano che sta suonando
let tempoStudio = 100;         // rallentamento del brano aperto: torna a 100 a ogni apertura
let timerLampo = null;
let metroUltimoMotivo = '';
const metroAttivo = () => impostazioni().metronomoAttivo !== false;
function opzioniMetro() {
  const i = impostazioni();
  return { ottavi: i.metronomoSuddivisione === 'Ottavi', accento: !!i.metronomoAccento, conteggio: String(i.metronomoConteggio === undefined ? '1' : i.metronomoConteggio) };
}
function pianoBrano(daSezione) {
  if (!branoAperto) return { modo: 'nessuno', motivo: '', tratti: [] };
  const sez = struttura.brano === branoAperto.id ? struttura.sezioni : [];
  return Regole.pianoMetronomo(branoPerDurata(), sez, Object.assign(opzioniMetro(), { daSezione }));
}
/** Pulsante "▶ Metronomo", "▶ da qui" sulle righe e riga che dice come suonerà (struttura o libero, e perché). */
function aggiornaPulsantiMetro() {
  const b = $('btnMetronomo'), info = $('metroModo');
  if (!b) return;
  const attivo = metroAttivo() && !!branoAperto;
  b.hidden = !attivo; $('navMetronomo').hidden = !metroAttivo();
  const p = attivo ? pianoBrano() : null;
  const suona = metro.inCorso() && metroDove === 'brano';
  b.textContent = suona ? '■ Stop' : '▶ Metronomo';
  b.classList.toggle('suona', suona);
  b.disabled = !!p && p.modo === 'nessuno';
  info.hidden = !attivo || !p || p.modo === 'struttura';
  info.textContent = p ? (p.modo === 'nessuno' ? 'Metronomo: ' + p.motivo + '.' : 'Metronomo ' + p.motivo + '.') : '';
  document.querySelectorAll('#listaSezioni .da-qui').forEach((x) => { x.hidden = !attivo || !p || p.modo !== 'struttura'; });
}
function evidenziaInCorso(idSezione) {
  document.querySelectorAll('#listaSezioni li.sezione.in-corso').forEach((x) => x.classList.remove('in-corso'));
  if (!idSezione || metroDove !== 'brano') return;
  const li = document.querySelector('#listaSezioni li[data-id="' + idSezione + '"]');
  if (li) li.classList.add('in-corso');
}
function riempiTempo() {
  const s = $('mTempo');
  if (!s.options.length) for (let t = Regole.TEMPO_MAX; t >= Regole.TEMPO_MIN; t -= Regole.TEMPO_PASSO) s.append(new Option(t + '%', String(t)));
  s.value = String(tempoStudio);
  s.classList.toggle('rallentato', tempoStudio < 100);
}
function mostraBarra(dove) {
  $('barraMetro').hidden = false; document.body.classList.add('con-metro');
  $('mTempo').hidden = dove !== 'brano';
  $('mLampo').hidden = !impostazioni().metronomoLampeggio;
  $('mNome').textContent = 'pronto…'; $('mPosizione').textContent = ''; $('mPoi').textContent = '';
  $('mNumero').hidden = true; $('mNumero').textContent = '';
  riempiTempo();
}
function nascondiBarra() {
  $('barraMetro').hidden = true; document.body.classList.remove('con-metro');
  evidenziaInCorso(null);
}
function avviaMetro(piano, dove, opz) {
  if (!piano || piano.modo === 'nessuno' || !piano.tratti.length) return;
  metroDove = dove; metroBrano = dove === 'brano' && branoAperto ? branoAperto.id : null;
  mostraBarra(dove);
  metro.avvia(piano, { tempo: dove === 'brano' ? tempoStudio : 100, volume: impostazioni().metronomoVolume }).then(() => { aggiornaPulsantiMetro(); aggiornaPulsanteSolo(); })
    .catch(() => { fermaMetro(); mostra('avvisoCodice', 'Questo telefono non ha aperto l\'audio: tocca di nuovo ▶.', true); });
  metroUltimoMotivo = piano.motivo || '';
}
/* Variante T6: il riferimento dice quale nota conta il BPM (come per il tap e le durate). Per non confonderlo
 * con la suddivisione si scrive il BPM con la sua nota e, se la nota non è il quarto, a cosa corrisponde. */
const NOTA = { 'Quarti': '♩', 'Ottavi': '♪', 'Quarti puntati': '♩.', 'Minime': 'minima' };
const notaBpm = (bpm, rif) => (NOTA[rif] || '♩') + ' = ' + bpmTesto(bpm);
/** "♪ = 138 · ♩ = 69 · battuta 3,5 s"; '' con riferimento Quarti o senza BPM valido. */
function testoEquivalenza(bpm, metro, rif) {
  bpm = Number(bpm);
  if (!rif || rif === 'Quarti' || !(bpm >= Regole.BPM_MIN && bpm <= Regole.BPM_MAX) || !Regole.QUARTI_PER_BATTUTA[metro]) return '';
  const battiti = Regole.battitiPerBattuta(metro, rif);
  const quarto = bpm * Regole.QUARTI_PER_BATTUTA[metro] / battiti;
  return notaBpm(bpm, rif) + ' · ♩ = ' + bpmTesto(quarto) + ' · battuta ' + bpmTesto(battiti * 60 / bpm) + ' s';
}
function mostraEquivalenza(dove, bpm, metro, rif) {
  if (!dove) return;
  const t = testoEquivalenza(bpm, metro, rif);
  dove.textContent = t; dove.hidden = !t;
}
function fermaMetro() { if (metro.inCorso()) metro.ferma(); else { nascondiBarra(); metroDove = null; metroBrano = null; aggiornaPulsantiMetro(); aggiornaPulsanteSolo(); } }
metro.su('battuta', (a) => {
  const rall = a.tempo < 100 ? ' (' + a.tempo + '%)' : '';
  const tempo = ' · ' + notaBpm(a.bpm, a.riferimento) + rall + ' · ' + a.metro;
  $('mNumero').hidden = !a.conteggio;
  if (a.conteggio) { $('mNome').textContent = 'Conteggio'; $('mPosizione').textContent = 'batt. ' + a.battuta + '/' + a.battute + tempo; }
  else if (a.battute === null) {
    $('mNome').textContent = metroDove === 'solo' ? 'Metronomo' : 'Libero';
    $('mPosizione').textContent = 'batt. ' + a.battuta + tempo;
  } else {
    // riga 2: battuta e tempo; riga 3 da sola: cosa viene dopo (a 390 px una riga unica veniva tagliata)
    $('mNome').textContent = a.nome;
    $('mPosizione').textContent = 'batt. ' + a.battuta + '/' + a.battute + (a.giri > 1 ? ' · giro ' + a.giro + '/' + a.giri : '') + tempo;
  }
  $('mPoi').textContent = a.battute === null ? (metroDove === 'brano' ? metroUltimoMotivo : '') : a.conteggio ? 'poi: ' + (a.prossimo ? a.prossimo.nome : '') : a.prossimo ? 'poi: ' + a.prossimo.nome + ' tra ' + a.prossimo.tra + ' batt.' : 'ultima sezione';
  evidenziaInCorso(a.conteggio ? null : a.sezione);
});
metro.su('colpo', (c) => {
  // Conteggio (variante T6): il numero 1 2 3 4 sempre; verde (riquadro e striscia) solo con il lampeggio acceso
  const lampeggio = !!impostazioni().metronomoLampeggio;
  const num = $('mNumero');
  if (c.conteggio) { num.textContent = String(c.numero); num.hidden = false; }
  if (!lampeggio || c.tipo === 'suddivisione') return;
  const l = $('mLampo');
  l.classList.add('acceso'); l.classList.toggle('uno', !c.conteggio && c.battito === 1); l.classList.toggle('conta', !!c.conteggio);
  if (c.conteggio) num.classList.add('acceso');
  clearTimeout(timerLampo); timerLampo = setTimeout(() => { l.classList.remove('acceso', 'uno', 'conta'); num.classList.remove('acceso'); }, 90);
});
metro.su('fermo', (f) => {
  nascondiBarra(); metroDove = null; metroBrano = null;
  aggiornaPulsantiMetro(); aggiornaPulsanteSolo();
  if (f && f.fine) statoSalva('metronomo: fine del brano');
});
$('mStop').addEventListener('click', fermaMetro);
$('mTempo').addEventListener('change', () => {
  tempoStudio = Number($('mTempo').value) || 100;
  $('mTempo').classList.toggle('rallentato', tempoStudio < 100);
  metro.cambiaTempo(tempoStudio);      // vale dalla battuta successiva
});
$('btnMetronomo').addEventListener('click', () => {
  if (metro.inCorso() && metroDove === 'brano') return fermaMetro();
  avviaMetro(pianoBrano(), 'brano');
});
/** "▶ da qui": un tocco sulla riga della sezione (anche senza rete). */
function daQui(idSezione) {
  const p = pianoBrano(idSezione);
  if (p.modo !== 'struttura') return;
  avviaMetro(p, 'brano');
}
// Si ferma in background (B1): Chrome rallenta i programmi e il click non sarebbe più a tempo
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && metro.inCorso()) metro.ferma(); });

/* Metronomo da solo: valori solo su questo telefono (dfak-metroSolo), niente rete. */
let solo = Object.assign({ bpm: 120, metro: '4/4', riferimento: 'Quarti', feel: 'Dritto' }, memoria.get('metroSolo') || {});
let tocchiSolo = [];
function salvaSolo() { memoria.set('metroSolo', solo); }
function preparaSolo() {
  if (!$('msMetro').options.length) {
    Regole.METRI.forEach((x) => $('msMetro').append(new Option(x, x)));
    Regole.RIFERIMENTI.forEach((x) => $('msRif').append(new Option(x, x)));
    Regole.FEEL.forEach((x) => $('msFeel').append(new Option(x, x)));
  }
  $('msBpm').value = solo.bpm; $('msMetro').value = solo.metro; $('msRif').value = solo.riferimento; $('msFeel').value = solo.feel;
  $('msTapInfo').textContent = 'Batti a tempo: ' + solo.riferimento.toLowerCase() + ' (almeno 4 tocchi).';
  aggiornaSolo();
  aggiornaPulsanteSolo();
}
/** Suddivisione del metronomo da solo (variante T6): parte dalle Impostazioni, poi vale l'ultima scelta fatta qui. */
function ottaviSolo() { return solo.ottavi === undefined ? opzioniMetro().ottavi : !!solo.ottavi; }
function aggiornaSolo() {
  const giaOttavi = solo.riferimento === 'Ottavi', ott = ottaviSolo();
  document.querySelectorAll('#msSuddivisione button').forEach((b) => {
    const premuto = b.dataset.ottavi === '1' ? ott && !giaOttavi : !ott || giaOttavi;
    b.disabled = giaOttavi; b.classList.toggle('scelto', premuto); b.setAttribute('aria-pressed', String(premuto));
  });
  $('msSudInfo').textContent = giaOttavi ? 'già in ottavi' : ott ? 'un colpo più piano tra un battito e l\'altro' : 'solo i battiti';
  mostraEquivalenza($('msEquivalenza'), solo.bpm, solo.metro, solo.riferimento);
}
function aggiornaPulsanteSolo() {
  const s = metro.inCorso() && metroDove === 'solo';
  $('btnAvviaM').textContent = s ? '■ Ferma' : '▶ Avvia';
  $('btnAvviaM').classList.toggle('suona', s);
}
function pianoSolo() { return Regole.pianoLibero(solo, Object.assign(opzioniMetro(), { ottavi: ottaviSolo() })); }
function bpmSolo(v, daTap) {
  v = Math.round(Number(v));
  if (!(v >= Regole.BPM_MIN && v <= Regole.BPM_MAX)) { $('msBpm').classList.add('invalido'); return; }
  $('msBpm').classList.remove('invalido');
  solo.bpm = v; salvaSolo();
  if (!daTap || document.activeElement !== $('msBpm')) $('msBpm').value = v;
  mostraEquivalenza($('msEquivalenza'), solo.bpm, solo.metro, solo.riferimento);
  if (metro.inCorso() && metroDove === 'solo') metro.cambiaBpm(v);    // dalla battuta successiva
}
$('msBpm').addEventListener('input', () => bpmSolo($('msBpm').value));
$('msBpm').addEventListener('blur', () => { $('msBpm').value = solo.bpm; $('msBpm').classList.remove('invalido'); });
document.querySelectorAll('.passi-bpm button').forEach((b) => b.addEventListener('click', () => bpmSolo(Math.max(Regole.BPM_MIN, Math.min(Regole.BPM_MAX, solo.bpm + Number(b.dataset.passo))))));
$('btnTapM').addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  tocchiSolo = Regole.tapAggiungi(tocchiSolo, ev.timeStamp || performance.now());
  const bpm = Regole.tapBpm(tocchiSolo);
  if (bpm) { bpmSolo(bpm, true); $('msTapInfo').textContent = bpm + ' BPM dal tap (' + tocchiSolo.length + ' tocchi, ' + solo.riferimento.toLowerCase() + ')' + (metro.inCorso() && metroDove === 'solo' ? ': cambia dalla prossima battuta.' : '. Fermati 2 s per ricominciare.'); }
  else $('msTapInfo').textContent = tocchiSolo.length < 4 ? 'Ancora ' + (4 - tocchiSolo.length) + ' tocchi…' : 'Tocchi irregolari: continua a tempo.';
});
$('msMetro').addEventListener('change', () => {
  const prima = solo.metro, dopo = $('msMetro').value;
  if (solo.riferimento === Regole.riferimentoSuggerito(prima)) { solo.riferimento = Regole.riferimentoSuggerito(dopo); $('msRif').value = solo.riferimento; }
  solo.metro = dopo; cambioSolo();
});
$('msRif').addEventListener('change', () => { solo.riferimento = $('msRif').value; cambioSolo(); });
$('msFeel').addEventListener('change', () => { solo.feel = $('msFeel').value; cambioSolo(); });
document.querySelectorAll('#msSuddivisione button').forEach((b) => b.addEventListener('click', () => {
  solo.ottavi = b.dataset.ottavi === '1'; salvaSolo(); aggiornaSolo();
  // al volo: stessi battiti, colpi nuovi dalla battuta successiva (niente nuovo conteggio)
  if (metro.inCorso() && metroDove === 'solo') { const p = pianoSolo(); metro.cambiaColpi(p.tratti[p.tratti.length - 1].colpi); }
}));
function cambioSolo() {
  salvaSolo(); aggiornaSolo();
  $('msTapInfo').textContent = 'Batti a tempo: ' + solo.riferimento.toLowerCase() + ' (almeno 4 tocchi).';
  if (metro.inCorso() && metroDove === 'solo') avviaMetro(pianoSolo(), 'solo');    // metro o riferimento nuovi: si riparte
}
$('btnAvviaM').addEventListener('click', () => {
  if (metro.inCorso() && metroDove === 'solo') return fermaMetro();
  avviaMetro(pianoSolo(), 'solo');
});

/* ---------- T6 · Schermo sempre acceso (decisione di Francesco) ----------
 * In tutta l'app finché è in primo piano; Android lo toglie da solo in background, e al ritorno si richiede.
 * Se il telefono non lo permette: una riga discreta, niente video di ripiego (il blocco nativo è collaudato dalla T0). */
let bloccoSchermo = null, richiestaSchermo = false, ultimaProvaSchermo = 0;
async function tieniAcceso() {
  if (document.visibilityState !== 'visible' || bloccoSchermo || richiestaSchermo) return;
  if (!('wakeLock' in navigator)) { $('avvisoSchermo').hidden = false; return; }
  richiestaSchermo = true; ultimaProvaSchermo = Date.now();
  try {
    bloccoSchermo = await navigator.wakeLock.request('screen');
    $('avvisoSchermo').hidden = true;
    bloccoSchermo.addEventListener('release', () => {
      bloccoSchermo = null;
      if (document.visibilityState === 'visible') setTimeout(tieniAcceso, 1000);    // tolto da Android (es. risparmio energetico)
    });
  } catch (e) {
    $('avvisoSchermo').hidden = false;
  } finally { richiestaSchermo = false; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tieniAcceso(); });
// (non ovvio) dopo un rifiuto si riprova al tocco, ma al massimo ogni 30 s: una richiesta a ogni tocco ritarderebbe il tap tempo
document.addEventListener('pointerdown', () => { if (!bloccoSchermo && Date.now() - ultimaProvaSchermo > 30000) tieniAcceso(); }, { passive: true });
tieniAcceso();

/* ---------- Impostazioni personali (salvate sul foglio) ---------- */
let impostazioniSalvate = null;
function disegnaImpostazioni(valori) {
  impostazioniSalvate = Object.assign({}, valori);
  const modulo = $('moduloImpostazioni');
  const fs = document.createElement('fieldset');
  Regole.IMPOSTAZIONI.forEach((d) => {
    const riga = document.createElement('div'); riga.className = 'campo';
    const etichetta = document.createElement('label'); etichetta.htmlFor = 'imp-' + d.chiave;
    etichetta.textContent = d.etichetta;
    if (!Regole.giaAttiva(d)) {
      const dalla = document.createElement('span'); dalla.className = 'dalla'; dalla.textContent = 'attiva dalla ' + d.dalla;
      etichetta.append(dalla);
    }
    riga.append(etichetta);
    let x;
    if (d.tipo === 'si-no') {
      const box = document.createElement('span'); box.className = 'interruttore';
      x = document.createElement('input'); x.type = 'checkbox'; x.checked = !!valori[d.chiave];
      box.append(x, document.createElement('span')); riga.append(box);
    } else if (d.tipo === 'scelta') {
      x = document.createElement('select');
      d.valori.forEach((v) => { const o = document.createElement('option'); o.value = o.textContent = v; x.append(o); });
      x.value = valori[d.chiave]; riga.append(x);
    } else {
      x = document.createElement('input'); x.type = 'range'; x.min = d.min; x.max = d.max; x.step = d.passo; x.value = valori[d.chiave];
      const out = document.createElement('output'); out.textContent = x.value;
      x.addEventListener('input', () => { out.textContent = x.value; });
      riga.append(x, out);
    }
    x.id = 'imp-' + d.chiave; x.name = d.chiave;
    x.addEventListener('change', programmaSalvataggio);
    fs.append(riga);
  });
  modulo.replaceChildren(fs);
  aggiornaRete();
}

function leggiModulo() {
  const v = {};
  Regole.IMPOSTAZIONI.forEach((d) => {
    const x = $('imp-' + d.chiave);
    v[d.chiave] = d.tipo === 'si-no' ? x.checked : (d.tipo === 'numero' ? Number(x.value) : x.value);
  });
  return v;
}

function statoSalva(testo, classe) { const x = $('statoSalva'); x.textContent = testo; x.className = classe || ''; }

let timerSalva = null;
function programmaSalvataggio() {
  clearTimeout(timerSalva); timerSalva = null;
  if (!puoScrivere()) { statoSalva('serve la rete', 'errore'); disegnaImpostazioni(impostazioniSalvate); return; }
  statoSalva('salvataggio…');
  timerSalva = setTimeout(() => { timerSalva = null; salvaImpostazioni(leggiModulo(), 0); }, 500);
}

/** Salvataggio in sottofondo con "salvato ✓"; se la rete cade si riprova 2 volte, poi si torna ai valori salvati. */
async function salvaImpostazioni(valori, tentativo) {
  const r = stato.dati.risposta;
  try {
    const j = await chiama('salvaImpostazioni', { impostazioni: valori, versione: r.versioneImpostazioni });
    if (!j.ok) { statoSalva('non salvato', 'errore'); disegnaImpostazioni(impostazioniSalvate); return; }
    r.impostazioni = j.impostazioni; r.versioneImpostazioni = j.versioneImpostazioni;
    impostazioniSalvate = Object.assign({}, j.impostazioni);
    salvaCopia();
    statoSalva('salvato ✓', 'salvato');
    disegnaRepertorio();    // notazione e suono reale cambiano subito l'elenco
    if (j.avviso) mostra('avvisoCodice', 'Le tue impostazioni erano state cambiate da un altro dispositivo (' + j.avviso.modificatoDa + ', ' + dataOra(j.avviso.modificatoIl) + '): ho salvato queste.');
  } catch (e) {
    if (e instanceof ErroreRete && tentativo < 2 && navigator.onLine) {
      statoSalva('riprovo…');
      setTimeout(() => salvaImpostazioni(valori, tentativo + 1), tentativo ? 5000 : 2000);
    } else {
      statoSalva('non salvato: serve la rete', 'errore');
      disegnaImpostazioni(impostazioniSalvate);
    }
  }
}

/* ---------- Amministrazione ---------- */
const URL_APP = location.origin + location.pathname.replace(/index\.html$/, '');
const linkDi = (c) => URL_APP + '?k=' + c;

async function copia(testo, idEsito) {
  try { await navigator.clipboard.writeText(testo); mostra(idEsito, 'Link copiato ✓ Incollalo su WhatsApp.'); }
  catch (e) { mostra(idEsito, testo); }
}

async function caricaMembriAdmin() {
  if (!stato.admin) return;
  if (senzaRete()) { mostra('esitoAdmin', 'Serve la rete per vedere e gestire i link.', true); return; }
  try {
    const j = await chiama('adminMembri');
    if (!j.ok) { if (j.errore === 'chiaveAdmin') return gestisciRifiuto(j); return mostra('esitoAdmin', 'Non riuscito: ' + j.errore, true); }
    stato.membriAdmin = j.membri;
    disegnaMembriAdmin();
  } catch (e) { mostra('esitoAdmin', 'Non riuscito: ' + e.message, true); }
}

function disegnaMembriAdmin() {
  const me = io();
  const ul = $('listaMembri'); ul.textContent = '';
  stato.membriAdmin.forEach((m) => {
    const li = document.createElement('li'); li.dataset.sigla = m.sigla;
    const testa = document.createElement('div'); testa.className = 'nome';
    const b = document.createElement('b'); b.textContent = m.sigla;
    testa.append(b, document.createTextNode(m.nome));
    if ((me && me.sigla === m.sigla) || (m.sigla === 'ADMIN' && chiaveAdmin())) {
      const q = document.createElement('span'); q.className = 'questo'; q.textContent = 'questo telefono'; testa.append(q);
    }
    const data = document.createElement('div'); data.className = 'data'; data.textContent = 'Codice creato il ' + dataOra(m.codiceRigeneratoIl);
    const bCopia = document.createElement('button'); bCopia.textContent = 'Copia link'; bCopia.className = 'secondario';
    bCopia.addEventListener('click', () => copia(linkDi(m.codice), 'esitoAdmin'));
    const bInvia = document.createElement('button'); bInvia.textContent = 'Condividi'; bInvia.className = 'secondario';
    bInvia.hidden = !navigator.share;
    bInvia.addEventListener('click', () => navigator.share({ title: 'Dish for a King – ' + m.sigla, text: 'Il tuo link personale per l\'app della band (' + m.sigla + ' – ' + m.nome + '):', url: linkDi(m.codice) }).catch(() => {}));
    const bRig = document.createElement('button'); bRig.textContent = 'Rigenera'; bRig.className = 'pericolo'; bRig.dataset.testo = 'Rigenera';
    bRig.addEventListener('click', () => chiediConferma(bRig, () => rigenera(m.sigla)));
    li.append(testa, data, bCopia, bInvia, bRig);
    ul.append(li);
  });
}

/** Conferma con un secondo tocco entro 4 secondi (niente finestre del browser). */
function chiediConferma(bottone, azione) {
  const testo = bottone.dataset.testo || bottone.textContent;
  const ripristina = () => { delete bottone.dataset.conferma; bottone.textContent = testo; bottone.className = 'pericolo'; };
  if (bottone.dataset.conferma) { ripristina(); return azione(); }
  bottone.dataset.conferma = '1'; bottone.textContent = 'Tocca di nuovo per confermare'; bottone.className = 'conferma';
  setTimeout(() => { if (bottone.dataset.conferma) ripristina(); }, 4000);
}

async function rigenera(sigla) {
  if (!puoScrivere('esitoAdmin')) return;
  try {
    const j = await chiama('rigenera', { sigla });
    if (!j.ok) return mostra('esitoAdmin', 'Non riuscito: ' + j.errore, true);
    const me = io();
    let nota = '';
    if (sigla === 'ADMIN') {
      memoria.del('chiaveAdmin'); stato.admin = false;
      nota = '\nLa chiave ADMIN di questo telefono non vale più: l\'amministrazione è stata tolta da qui. Per riaverla apri il nuovo link ADMIN.';
    } else if (me && me.sigla === sigla) {
      memoria.set('codice', j.codice);   // è il codice di questo telefono: lo aggiorno qui
      nota = '\nÈ il codice di questo telefono: l\'ho già aggiornato qui.';
    }
    mostra('esitoAdmin', sigla + ': nuovo codice creato. Il vecchio link non funziona più.' + nota + '\n\nNuovo link: ' + linkDi(j.codice));
    if (sigla === 'ADMIN') { disegna(); vai('vInizio'); mostra('avvisoCodice', 'Chiave ADMIN rigenerata. Nuovo link ADMIN: ' + linkDi(j.codice)); return; }
    const m = stato.membriAdmin.find((x) => x.sigla === sigla);
    if (m) { m.codice = j.codice; m.codiceRigeneratoIl = j.codiceRigeneratoIl; }
    disegnaMembriAdmin();
  } catch (e) { mostra('esitoAdmin', 'Non riuscito: ' + e.message + '. Il codice NON è stato cambiato.', true); }
}

$('btnBackup').addEventListener('click', async () => {
  if (!puoScrivere('esitoBackup')) return;
  mostra('esitoBackup', 'Copia in corso…');
  try {
    const j = await chiama('backupOra');
    if (!j.ok) return mostra('esitoBackup', 'Non riuscito: ' + j.errore, true);
    const x = $('esitoBackup'); x.textContent = 'Fatto ✓ ' + j.backup.nome + ' (copie tenute: ' + j.backup.copieTenute + ')\n';
    const a = document.createElement('a'); a.href = j.backup.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Apri la copia su Drive';
    x.append(a);
  } catch (e) { mostra('esitoBackup', 'Non riuscito: ' + e.message, true); }
});

$('btnMisura').addEventListener('click', async () => {
  if (senzaRete()) return mostra('esitoMisura', 'Serve la rete.', true);
  const tempi = [];
  mostra('esitoMisura', 'Misuro 5 letture…');
  try {
    for (let i = 0; i < 5; i++) {
      const j = await chiama('avvio');
      if (!j.ok) throw new Error(j.errore);
      tempi.push(j.msTotale + ' (motore ' + j.msMotore + ')');
    }
    const n = tempi.map((t) => parseInt(t, 10));
    mostra('esitoMisura', 'Tempi in ms: ' + tempi.join(', ') + '\nmin ' + Math.min(...n) + ' · media ' + Math.round(n.reduce((a, b) => a + b, 0) / n.length) + ' · max ' + Math.max(...n));
  } catch (e) { mostra('esitoMisura', 'Misura interrotta: ' + e.message, true); }
});

$('btnEsciAdmin').addEventListener('click', () => {
  memoria.del('chiaveAdmin'); stato.admin = false; stato.membriAdmin = null;
  $('listaMembri').textContent = '';
  memoria.set('vista', 'vInizio');
  disegna();
});

/* ---------- Memoria offline e nuova versione ---------- */
let registrazione = null;
let ricaricaDopoAggiornamento = false;
function mostraAvvisoVersione() { $('avvisoVersione').hidden = false; }
function seguiAggiornamenti(reg) {
  if (reg.waiting && navigator.serviceWorker.controller) mostraAvvisoVersione();
  reg.addEventListener('updatefound', () => {
    const nuovo = reg.installing;
    if (!nuovo) return;
    nuovo.addEventListener('statechange', () => { if (nuovo.state === 'installed' && navigator.serviceWorker.controller) mostraAvvisoVersione(); });
  });
}
async function leggiVersione() {
  const reg = await navigator.serviceWorker.ready;
  const sw = navigator.serviceWorker.controller || reg.active;
  if (!sw) return;
  const canale = new MessageChannel();
  canale.port1.onmessage = (ev) => { stato.app = ev.data.versione; $('versioneApp').textContent = ev.data.versione; };
  sw.postMessage({ tipo: 'versione' }, [canale.port2]);
}
async function controllaAggiornamenti() {
  if (!registrazione || !navigator.onLine) return;
  try { await registrazione.update(); } catch (e) { /* GitHub non raggiungibile: si riprova alla prossima apertura */ }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    registrazione = reg;
    seguiAggiornamenti(reg);
    controllaAggiornamenti();          // a ogni apertura (decisione T0-bis)
    leggiVersione();
  }).catch(() => { /* senza memoria offline l'app funziona lo stesso con la rete */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (ricaricaDopoAggiornamento) location.reload(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { controllaAggiornamenti(); avvia(); }
  });
}
$('avvisoVersione').addEventListener('click', () => {
  if (!registrazione || !registrazione.waiting) return location.reload();
  ricaricaDopoAggiornamento = true;
  registrazione.waiting.postMessage({ tipo: 'attiva' });
});

/* ---------- Installazione ---------- */
let richiestaInstallazione = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); richiestaInstallazione = e; $('riquadroInstalla').hidden = false; });
$('btnInstalla').addEventListener('click', async () => {
  if (!richiestaInstallazione) return;
  richiestaInstallazione.prompt();
  await richiestaInstallazione.userChoice;
  richiestaInstallazione = null; $('riquadroInstalla').hidden = true;
});
window.addEventListener('appinstalled', () => { $('riquadroInstalla').hidden = true; });

/* ---------- T7 · Serate, scaletta e stampa ----------
 * Serata: si salva appena c'è la data (come il brano con il titolo). Scaletta: copia di lavoro salvata TUTTA
 * insieme 1,5 s dopo l'ultima modifica, con le righe che il telefono conosceva (unione nel motore, come la struttura).
 * Righe: brano, pausa (minuti), bis, riga libera (testo + minuti facoltativi). Durate solo musica (decisione 1A). */
const serateTutte = () => { const r = risposta(); return (r && r.serate) || []; };
const scaletteTutte = () => { const r = risposta(); return (r && r.scalette) || []; };
const righeDi = (serataId) => scaletteTutte().filter((x) => x.serata === serataId).sort((a, b) => a.ordine - b.ordine);
function oggiLocale() { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
let serataAperta = null;       // copia di lavoro { id, versione, data, locale, localeId, orario, note } (versione 0 = non salvata)
let scal = { serata: null, righe: [], conosciute: [], aperta: null };
let timerSerata = null, serataInCorso = false, serataDiNuovo = false;
let timerScaletta = null, scalettaInCorso = false, scalettaDiNuovo = false, ordinatoreScaletta = null;
let prossimoTorna = null, tornaSerata = null;   // scheda brano aperta dalla scaletta: "◀" riporta alla serata
let scelti = [];
const CAMPI_RIGA = ['id', 'tipo', 'brano', 'nota', 'minuti'];

function serataSalvata() { return !!(serataAperta && serateTutte().some((s) => s.id === serataAperta.id)); }
function riepilogoDi(righe, orario) { const r = risposta(); return Regole.riepilogoScaletta(righe, brani(), (r && r.sezioni) || [], orario || ''); }
function quantiSanno(branoId) { return statiStudio().filter((s) => s.brano === branoId && s.stato === 'Lo so').length; }
function testoBrani(n) { return n === 1 ? '1 brano' : n + ' brani'; }
function dataSerata(s, breve) { return Regole.scriviData(s.data, breve) || 'senza data'; }

/* Elenco delle serate e riquadro "Prossima serata" nella schermata Inizio */
function infoScaletta(s) {
  const rp = riepilogoDi(righeDi(s.id), '');
  return rp.totale.brani ? testoBrani(rp.totale.brani) + ' · ' + Regole.scriviDurataSet(rp.totale) : 'scaletta vuota';
}
function disegnaSerate() {
  const o = Regole.ordinaSerate(serateTutte(), oggiLocale());
  const riga = (s) => {
    const li = el('li'); const b = el('button', 'serata'); b.type = 'button'; b.dataset.id = s.id;
    b.append(el('b', '', dataSerata(s)), el('span', 'dove', (s.locale || 'locale da scrivere') + (s.orario ? ' · ore ' + s.orario : '')), el('span', 'info', infoScaletta(s)));
    b.addEventListener('click', () => apriSerata(s.id));
    li.append(b); return li;
  };
  const up = $('listaProssime'); up.textContent = ''; o.prossime.forEach((s) => up.append(riga(s)));
  const pp = $('listaPassate'); pp.textContent = ''; o.passate.forEach((s) => pp.append(riga(s)));
  $('nPassate').textContent = o.passate.length;
  $('boxPassate').hidden = !o.passate.length;
  const v = $('serateVuote');
  v.textContent = o.prossime.length ? '' : (o.passate.length ? 'Nessuna serata in arrivo.' : 'Ancora nessuna serata.') + (io() ? ' Tocca "+ Nuova serata".' : '');
  v.hidden = !v.textContent;
  $('btnNuovaSerata').hidden = !io();
  const p = o.prossima, box = $('riquadroProssima');
  box.hidden = !p;
  if (p) {
    box.dataset.id = p.id;
    $('prossimaData').textContent = dataSerata(p) + (p.data === oggiLocale() ? ' · stasera' : '');
    $('prossimaDove').textContent = (p.locale || 'locale da scrivere') + (p.orario ? ' · ore ' + p.orario : '');
    $('prossimaScaletta').textContent = infoScaletta(p);
  }
  aggiornaIngressiPalco();   // T8: "▶ Palco della prossima serata"
}
$('riquadroProssima').addEventListener('click', () => { if ($('riquadroProssima').dataset.id) apriSerata($('riquadroProssima').dataset.id); });
$('btnNuovaSerata').addEventListener('click', () => { if (puoScrivere('esitoSerate')) apriSerata(null); });

/* Scheda serata */
function copiaRiga(x) { const o = {}; CAMPI_RIGA.concat(['versione']).forEach((k) => { o[k] = x[k] === undefined || x[k] === null ? '' : x[k]; }); if (!o.tipo) o.tipo = 'brano'; return o; }
function rigaPerMotore(x) { const o = {}; CAMPI_RIGA.forEach((k) => { o[k] = x[k] === undefined || x[k] === null ? '' : x[k]; }); return o; }
function scalettaOccupata() {
  const a = document.activeElement;
  return !$('vSerata').hidden && (!!timerSerata || serataInCorso || !!timerScaletta || scalettaInCorso
    || !!(a && a.tagName !== 'BUTTON' && ($('moduloSerata').contains(a) || $('listaScaletta').contains(a))));
}

function apriSerata(id, daRidisegno) {
  const s = id ? serateTutte().find((x) => x.id === id) : null;
  if (id && !s) return vai('vSerate');
  serataAperta = s ? Object.assign({ localeId: '' }, s) : { id: nuovoIdBrano(), versione: 0, data: '', locale: '', localeId: '', orario: '', note: '' };
  const lista = righeDi(serataAperta.id).map(copiaRiga);
  const aperta = scal.serata === serataAperta.id && lista.some((x) => x.id === scal.aperta) ? scal.aperta : null;
  scal = { serata: serataAperta.id, righe: lista, conosciute: lista.map((x) => ({ id: x.id, versione: x.versione })), aperta };
  riempiSerata();
  if (!daRidisegno || $('vSerata').hidden) vai('vSerata'); else aggiornaRete();
  if (!s) $('sData').focus();
}
function riempiSerata() {
  memoria.set('serataAperta', serataAperta.id);
  $('sData').value = serataAperta.data; $('sOrario').value = serataAperta.orario;
  $('sLocale').value = serataAperta.locale; $('sNote').value = serataAperta.note;
  document.querySelectorAll('#moduloSerata .invalido').forEach((x) => x.classList.remove('invalido'));
  $('riquadroEliminaSerata').hidden = !stato.admin || !serataSalvata();
  const be = $('btnEliminaSerata'); delete be.dataset.conferma; be.textContent = 'Elimina serata'; be.className = 'pericolo';
  mostra('esitoSerata', ''); mostra('esitoScaletta', '');
  aggiornaInfoSerata();
  $('sLocaliSugg').hidden = true; aggiornaLocaleSerata();
  disegnaScaletta();
  if (window.Scheda) Scheda.aggiornaSerata();   // T8-bis-1: pulsante "Scheda tecnica"; variante: setup e collegamento
}
function aggiornaInfoSerata() {
  const s = serataAperta;
  $('sInfo').textContent = s.versione ? 'Ultima modifica ' + (s.modificatoDa || '') + ' il ' + dataOra(s.modificatoIl) : 'Serata nuova: si salva appena scrivi la data.';
}
function leggiModuloSerata() {
  return { id: serataAperta.id, data: $('sData').value, locale: $('sLocale').value, localeId: serataAperta.localeId || '', orario: $('sOrario').value, note: $('sNote').value };
}

/* ---------- Variante T8-bis-2 · Locale della serata dalla rubrica (tutti) ----------
 * Mentre si scrive compaiono i locali della rubrica; "+ Nuovo locale" lo crea con il nome scritto e apre la sua scheda,
 * "◀" torna qui con il locale già collegato. Se il testo è uguale al nome di un locale (maiuscole e spazi non contano)
 * si collega da solo, come fa installa con le serate vecchie. Se si cambia il testo, il collegamento si toglie. */
const localiRubrica = () => (window.Locali ? Locali.tutti() : []);
function localeDellaSerata() { return serataAperta && serataAperta.localeId ? localiRubrica().find((l) => l.id === serataAperta.localeId) || null : null; }
function aggiornaLocaleSerata() {
  if (!serataAperta) return;
  const l = localeDellaSerata(), t = $('sLocale').value.trim(), p = $('sLocaleStato');
  $('sLocaleApri').hidden = !l;
  if (l) $('sLocaleTesto').textContent = '✓ Dalla rubrica' + [l.citta, Locali.nomeMixer(l.mixer)].filter(Boolean).map((x) => ' · ' + x).join('');
  else if (serataAperta.localeId) $('sLocaleTesto').textContent = 'Il locale non è più nella rubrica.';
  else $('sLocaleTesto').textContent = t ? 'Non è nella rubrica: sceglilo dall\'elenco o tocca "+ Nuovo locale".' : '';
  p.hidden = !$('sLocaleTesto').textContent;
}
function disegnaSuggLocali() {
  const ul = $('sLocaliSugg'); ul.textContent = '';
  const t = $('sLocale').value, l0 = localeDellaSerata();
  if (!io() || senzaRete() || document.activeElement !== $('sLocale') || (l0 && Regole.localePerNome(t, [l0]))) { ul.hidden = true; return; }
  Regole.cercaLocali(t, localiRubrica()).forEach((l) => {
    const li = el('li'); const b = el('button', '', l.nome); b.type = 'button';
    if (l.citta) b.append(el('span', '', l.citta));
    b.addEventListener('pointerdown', (e) => e.preventDefault());   // il campo non perde il fuoco prima del tocco
    b.addEventListener('click', () => scegliLocaleSerata(l));
    li.append(b); ul.append(li);
  });
  if (t.trim() && !Regole.localePerNome(t, localiRubrica())) {
    const li = el('li'); const b = el('button', 'nuovo', '+ Nuovo locale "' + t.trim() + '"'); b.type = 'button';
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', nuovoLocaleSerata);
    li.append(b); ul.append(li);
  }
  ul.hidden = !ul.children.length;
}
function scegliLocaleSerata(l) {
  serataAperta.localeId = l.id; $('sLocale').value = l.nome;
  $('sLocaliSugg').hidden = true; $('sLocale').blur();
  aggiornaLocaleSerata(); cambioSerata();
}
function salvaSerataSubito() { if (timerSerata) { clearTimeout(timerSerata); timerSerata = null; return salvaSerata(0); } return Promise.resolve(); }
async function nuovoLocaleSerata() {
  const nome = $('sLocale').value.trim();
  if (!nome || !puoScrivere('esitoSerata')) return;
  $('sLocaliSugg').hidden = true; $('sLocale').blur();
  try {
    const j = await chiama('salvaLocale', { locale: { id: nuovoIdBrano(), nome, contatti: [] } });
    if (!j.ok) return mostra('esitoSerata', 'Locale non creato: ' + j.errore, true);
    Locali.ricevi(j.locale);
    serataAperta.localeId = j.locale.id; $('sLocale').value = j.locale.nome;
    aggiornaLocaleSerata(); cambioSerata(); await salvaSerataSubito();
    apriLocaleDallaSerata(j.locale.id, 'Locale aggiunto alla rubrica: scrivi mixer, misure e contatti. Con "◀" torni alla serata.');
  } catch (e) { mostra('esitoSerata', 'Locale non creato: ' + e.message, true); }
}
function apriLocaleDallaSerata(id, testo) {
  const sid = serataAperta.id;
  Locali.apriDa(id, () => { if (serateTutte().some((s) => s.id === sid)) apriSerata(sid); else vai('vSerata'); }, testo);
}
$('sLocale').addEventListener('input', () => {
  const l = localeDellaSerata();
  if (serataAperta && serataAperta.localeId && !(l && Regole.localePerNome($('sLocale').value, [l]))) serataAperta.localeId = '';
  if (serataAperta && !serataAperta.localeId) { const u = Regole.localePerNome($('sLocale').value, localiRubrica()); if (u) serataAperta.localeId = u.id; }
  aggiornaLocaleSerata(); disegnaSuggLocali();
});
$('sLocale').addEventListener('focus', disegnaSuggLocali);
$('sLocale').addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== $('sLocale')) $('sLocaliSugg').hidden = true; }, 200); });   // (non ovvio) il tocco su un suggerimento arriva dopo il blur
$('sLocaleApri').addEventListener('click', async () => { if (localeDellaSerata()) { await salvaSerataSubito(); apriLocaleDallaSerata(serataAperta.localeId); } });
const CAMPO_SERATA = { data: 'sData', orario: 'sOrario', locale: 'sLocale', note: 'sNote' };
function cambioSerata() {
  clearTimeout(timerSerata); timerSerata = null;
  aggiornaVistaScaletta();                       // orari previsti aggiornati mentre si scrive l'inizio
  if (!io() || !serataAperta) return;
  if (!puoScrivere('esitoSerata')) { statoSalva('serve la rete', 'errore'); return; }
  const n = Regole.normalizzaSerata(leggiModuloSerata());
  document.querySelectorAll('#moduloSerata .invalido').forEach((x) => x.classList.remove('invalido'));
  n.errori.forEach((c) => { const x = $(CAMPO_SERATA[c]); if (x) x.classList.add('invalido'); });
  if (n.errori.length) {
    statoSalva(n.errori.includes('data') ? 'serve la data' : 'da correggere', 'errore');
    mostra('esitoSerata', n.errori.includes('data') ? 'Scrivi la data: la serata si salva da lì.' : 'Orario da correggere: scrivilo come 22:00 (va bene anche 22.00 o 2200).', true);
    return;
  }
  mostra('esitoSerata', '');
  statoSalva('salvataggio…');
  timerSerata = setTimeout(() => { timerSerata = null; salvaSerata(0); }, 700);
}
async function salvaSerata(tentativo) {
  if (serataInCorso) { serataDiNuovo = true; return; }
  const dati = leggiModuloSerata();
  if (Regole.normalizzaSerata(dati).errori.length) return;
  serataInCorso = true;
  const id = dati.id, eraNuova = !serataSalvata();
  try {
    const j = await chiama('salvaSerata', { serata: dati, versione: serataAperta && serataAperta.id === id && serataAperta.versione ? serataAperta.versione : undefined });
    if (!j.ok && j.errore === 'locale' && serataAperta && serataAperta.id === id) {   // il locale scelto è stato tolto dalla rubrica nel frattempo
      serataAperta.localeId = ''; aggiornaLocaleSerata(); statoSalva('non salvato', 'errore');
      mostra('esitoSerata', 'Il locale scelto non è più nella rubrica: sceglilo di nuovo o crealo con "+ Nuovo locale".', true); return;
    }
    if (!j.ok) { statoSalva('non salvato', 'errore'); mostra('esitoSerata', 'Non salvata: ' + (j.campi ? j.campi.join(', ') : j.errore), true); return; }
    const r = risposta(); r.serate = r.serate || [];
    const i = r.serate.findIndex((x) => x.id === id);
    if (i >= 0) r.serate[i] = j.serata; else r.serate.push(j.serata);
    salvaCopia();
    if (serataAperta && serataAperta.id === id) {
      Object.assign(serataAperta, j.serata);
      if (document.activeElement !== $('sOrario')) $('sOrario').value = j.serata.orario;
      if (j.serata.localeId && document.activeElement !== $('sLocale')) $('sLocale').value = j.serata.locale;   // nome della rubrica
      $('riquadroEliminaSerata').hidden = !stato.admin;
      aggiornaInfoSerata(); aggiornaLocaleSerata();
      if (window.Scheda) Scheda.aggiornaSerata();
      if (eraNuova) { disegnaScaletta(); if (scal.righe.length) cambioScaletta(); }   // copia di una serata: ora si salva anche la scaletta
    }
    disegnaSerate(); disegnaDaCollegare();
    statoSalva('salvato ✓', 'salvato');
    if (j.avviso) mostra('esitoSerata', 'Attenzione: ' + j.avviso.modificatoDa + ' aveva modificato questa serata il ' + dataOra(j.avviso.modificatoIl) + '. Hai salvato la tua versione: controllate insieme.', true);
  } catch (e) {
    if (e instanceof ErroreRete && tentativo < 2 && navigator.onLine) {
      statoSalva('riprovo…'); serataInCorso = false;
      setTimeout(() => salvaSerata(tentativo + 1), tentativo ? 5000 : 2000);
      return;
    }
    statoSalva('non salvato: serve la rete', 'errore');
    mostra('esitoSerata', 'Non salvata: ' + e.message + '. Le modifiche restano su questa schermata finché non la lasci.', true);
  } finally {
    serataInCorso = false;
    if (serataDiNuovo) { serataDiNuovo = false; salvaSerata(0); }
  }
}
['sData', 'sLocale', 'sOrario', 'sNote'].forEach((x) => $(x).addEventListener('input', cambioSerata));
$('sOrario').addEventListener('blur', () => { const o = Regole.leggiOrario($('sOrario').value); if (o) $('sOrario').value = o; });
$('btnSerataIndietro').addEventListener('click', () => {
  if (timerSerata) { clearTimeout(timerSerata); timerSerata = null; salvaSerata(0); }
  if (timerScaletta) { clearTimeout(timerScaletta); timerScaletta = null; salvaScaletta(0); }
  vai('vSerate');
});

/* Scaletta */
function orarioScritto() { return Regole.leggiOrario($('sOrario').value) || ''; }
function rigaDurata(s, nome) {
  const d = Regole.scriviDurataSet(s);
  return nome + (d ? ' ' + d : '') + (s.inizio ? ' · ' + s.inizio + ' → circa ' + s.fine : '');
}
/** Contenuto della riga compatta (numero, titolo, dettagli). Si riscrive anche mentre si scrive nel riquadro aperto. */
function riempiCorpoRiga(corpo, x, info, rp, ctx) {
  corpo.textContent = '';
  const r1 = el('span', 'r1');
  if (x.tipo === 'brano') {
    const b = ctx.perId[x.brano];
    r1.append(el('span', 'num', info.numero + ''), el('span', 'titolo', b ? b.titolo : '(brano tolto)'));
    if (b && b.stato !== 'Definitivo') r1.append(el('span', 'etichetta-stato in-prova', 'In prova'));   // T9-1 (D2 A): nell'app, non sul foglio
    const det = el('span', 'det');
    if (b) {
      const t = tonalitaDi(b), d = Regole.durataEffettiva(b, ctx.sez.filter((s) => s.brano === b.id));
      det.append([t.suonata ? t.testo : '', b.bpm ? b.bpm + ' BPM' : '', d.secondi !== null ? Regole.scriviDurata(d.secondi) : 'durata ?'].filter(Boolean).join(' · ') + ' · ');
      det.append(el('span', 'sanno', quantiSanno(b.id) + '/5 lo sanno'));
      if (rp.doppioni[b.id]) det.append(' · ', el('span', 'doppio', 'in scaletta ' + rp.doppioni[b.id] + ' volte'));
    }
    corpo.append(r1, det);
    if (x.nota) corpo.append(el('span', 'nota', x.nota));
  } else if (x.tipo === 'pausa') {
    const s = rp.sets[info.set - 1];
    r1.append(el('span', 'titolo', 'Pausa ' + (x.minuti || '?') + ' min'));
    corpo.append(r1, el('span', 'det', s ? 'fine ' + rigaDurata(s, ctx.nomeSet(s.numero)) : ''));
  } else if (x.tipo === 'bis') {
    const s = rp.sets[rp.sets.length - 1];
    r1.append(el('span', 'titolo', 'Bis'));
    corpo.append(r1, el('span', 'det', s ? 'fine ' + rigaDurata(s, ctx.nomeSet(s.numero)) : ''));
  } else {
    r1.append(el('span', 'num', '›'), el('span', 'titolo', x.nota || '(scrivi il testo)'));
    corpo.append(r1);
    if (x.minuti) corpo.append(el('span', 'det', x.minuti + ' min'));
  }
}
function contestoScaletta() {
  const rp = riepilogoDi(scal.righe, orarioScritto());
  const perId = {}; brani().forEach((b) => { perId[b.id] = b; });
  const r = risposta(), piuSet = rp.sets.length > 1;
  return { rp, perId, sez: (r && r.sezioni) || [], nomeSet: (k) => (piuSet || rp.bis ? k + '° set' : 'set') };
}
/** Totale in testa, brani senza durata, ultimo set e bis in fondo. */
function disegnaTotaliScaletta(ctx) {
  const rp = ctx.rp;
  const t = $('scTotale'); t.textContent = '';
  if (rp.totale.brani || rp.totale.minutiExtra) t.append(testoBrani(rp.totale.brani) + ' · totale ', el('b', '', Regole.scriviDurataSet(rp.totale)));
  const m = $('scMancanti');
  m.textContent = rp.totale.mancanti.length ? 'Senza durata: ' + rp.totale.mancanti.join(', ') + ' (scrivi la durata manuale o le battute nella struttura).' : '';
  m.hidden = !m.textContent;
  const fondo = [], ultimo = rp.sets[rp.sets.length - 1];
  if (ultimo && !rp.bis && (rp.sets.length > 1 || rp.conOrari) && ultimo.righe.length) fondo.push(rigaDurata(ultimo, ctx.nomeSet(ultimo.numero)));
  if (rp.bis) fondo.push(rigaDurata(rp.bis, 'Bis'));
  const f = $('scFondo'); f.textContent = fondo.join(' · '); f.hidden = !fondo.length;
}
/**
 * (non ovvio) Mentre si scrive nel riquadro aperto (nota, minuti, inizio della serata) si riscrivono solo le righe
 * compatte e i totali, senza ricostruire la lista: ricostruendola, il campo toccato subito dopo sparirebbe sotto il dito.
 */
function aggiornaVistaScaletta() {
  const ctx = contestoScaletta();
  scal.righe.forEach((x, i) => {
    const c = document.querySelector('#listaScaletta li[data-id="' + x.id + '"] button.corpo');
    if (c) riempiCorpoRiga(c, x, ctx.rp.perRiga[i] || {}, ctx.rp, ctx);
  });
  disegnaTotaliScaletta(ctx);
}
function disegnaScaletta() {
  const ul = $('listaScaletta'); ul.textContent = '';
  const ctx = contestoScaletta(), n = scal.righe.length;
  scal.righe.forEach((x, i) => {
    const li = el('li', 'sezione' + (x.tipo !== 'brano' ? ' speciale ' + x.tipo : '') + (scal.aperta === x.id ? ' aperta' : ''));
    li.dataset.id = x.id;
    const riga = el('div', 'riga-sez');
    const maniglia = el('span', 'maniglia', '≡'); maniglia.setAttribute('aria-label', 'trascina per spostare');
    const corpo = el('button', 'corpo'); corpo.type = 'button';
    riempiCorpoRiga(corpo, x, ctx.rp.perRiga[i] || {}, ctx.rp, ctx);
    corpo.addEventListener('click', () => { scal.aperta = scal.aperta === x.id ? null : x.id; disegnaScaletta(); });
    const frecce = el('span', 'frecce');
    const su = el('button', 'su', '▲'); su.type = 'button'; su.setAttribute('aria-label', 'sposta su'); su.disabled = i === 0;
    const giu = el('button', 'giu', '▼'); giu.type = 'button'; giu.setAttribute('aria-label', 'sposta giù'); giu.disabled = i === n - 1;
    su.addEventListener('click', () => spostaRiga(i, -1));
    giu.addEventListener('click', () => spostaRiga(i, 1));
    frecce.append(su, giu);
    riga.append(maniglia, corpo, frecce); li.append(riga);
    if (scal.aperta === x.id) li.append(editorRiga(x));
    ul.append(li);
  });
  disegnaTotaliScaletta(ctx);
  const v = $('scVuota');
  v.textContent = !serataSalvata() ? (n ? 'La scaletta si salva appena scrivi la data.' : 'Prima scrivi la data: poi puoi preparare la scaletta.')
    : !n ? (io() ? 'Ancora nessun brano: tocca "+ Brani".' : 'Scaletta vuota.') : '';
  v.hidden = !v.textContent;
  preparaOrdinatoreScaletta();
  aggiornaRete();
}
function editorRiga(x) {
  const box = el('div', 'editor');
  const campo = (etichetta, nome, attr) => {
    const lab = el('label', 'etichetta', etichetta);
    const inp = el('input'); inp.dataset.campo = nome; inp.value = x[nome] === undefined ? '' : x[nome];
    Object.assign(inp, attr || {});
    inp.addEventListener('input', () => { x[nome] = nome === 'minuti' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value; aggiornaVistaScaletta(); cambioScaletta(); });
    lab.append(inp); box.append(lab);
  };
  if (x.tipo === 'brano') campo('Nota per questa serata (va sul foglio)', 'nota', { maxLength: Regole.MAX_NOTA_RIGA, placeholder: 'es. attacca subito, Ste cambia chitarra' });
  if (x.tipo === 'pausa') campo('Minuti di pausa', 'minuti', { type: 'number', inputMode: 'numeric', min: Regole.PAUSA_MIN, max: Regole.PAUSA_MAX });
  if (x.tipo === 'libera') {
    campo('Testo (va sul foglio)', 'nota', { maxLength: Regole.MAX_LIBERA, placeholder: 'es. Ospite, Stacchetto, Sindaco che parla' });
    campo('Minuti (facoltativi: contano negli orari)', 'minuti', { type: 'number', inputMode: 'numeric', min: 0, max: Regole.MAX_MINUTI_LIBERA });
  }
  const az = el('div', 'azioni-sez');
  if (x.tipo === 'brano' && brani().some((b) => b.id === x.brano)) {
    const ap = el('button', 'secondario', 'Apri scheda brano'); ap.type = 'button';
    ap.addEventListener('click', () => { prossimoTorna = serataAperta.id; apriBrano(x.brano); });
    az.append(ap);
  }
  const via = el('button', 'pericolo', 'Togli dalla scaletta'); via.type = 'button'; via.dataset.togli = '1';
  via.addEventListener('click', () => { scal.righe = scal.righe.filter((y) => y.id !== x.id); if (scal.aperta === x.id) scal.aperta = null; disegnaScaletta(); cambioScaletta(); });
  az.append(via); box.append(az);
  return box;
}
function spostaRiga(i, d) {
  const j = i + d;
  if (j < 0 || j >= scal.righe.length) return;
  const t = scal.righe[i]; scal.righe[i] = scal.righe[j]; scal.righe[j] = t;
  disegnaScaletta(); cambioScaletta();
}
function preparaOrdinatoreScaletta() {
  if (!window.Sortable || ordinatoreScaletta) return;
  ordinatoreScaletta = Sortable.create($('listaScaletta'), {
    handle: '.maniglia', animation: 150, ghostClass: 'fantasma', draggable: 'li.sezione',
    onEnd: (e) => {
      if (e.oldIndex === e.newIndex) return;
      const [x] = scal.righe.splice(e.oldIndex, 1);
      scal.righe.splice(e.newIndex, 0, x);
      disegnaScaletta(); cambioScaletta();
    }
  });
}
/** Le righe nuove vanno prima del Bis, se c'è (il Bis resta in fondo); si trascinano dove si vuole. */
function aggiungiRighe(nuove, apri) {
  if (scal.righe.length + nuove.length > Regole.MAX_SCALETTA) { mostra('esitoScaletta', 'Massimo ' + Regole.MAX_SCALETTA + ' righe in una scaletta.', true); return false; }
  const ib = scal.righe.findIndex((x) => x.tipo === 'bis');
  const dove = ib >= 0 && !nuove.some((x) => x.tipo === 'bis') ? ib : scal.righe.length;
  scal.righe.splice(dove, 0, ...nuove.map((x) => Object.assign({ id: nuovoIdBrano(), tipo: 'brano', brano: '', nota: '', minuti: '', versione: 0 }, x)));
  if (apri) scal.aperta = scal.righe[dove].id;
  mostra('esitoScaletta', '');
  disegnaScaletta(); cambioScaletta();
  return true;
}
$('btnAggPausa').addEventListener('click', () => aggiungiRighe([{ tipo: 'pausa', minuti: Regole.PAUSA_PROPOSTA }], true));
$('btnAggLibera').addEventListener('click', () => {
  if (aggiungiRighe([{ tipo: 'libera' }], true)) { const x = document.querySelector('#listaScaletta li.aperta [data-campo="nota"]'); if (x) x.focus(); }
});
$('btnAggBis').addEventListener('click', () => {
  if (scal.righe.some((x) => x.tipo === 'bis')) return mostra('esitoScaletta', 'C’è già il Bis: i brani dopo il Bis sono il bis.', true);
  aggiungiRighe([{ tipo: 'bis' }], false);
});

function nomeCampoRiga(c) {
  return { brano: 'brano', minuti: 'minuti', nota: 'testo della riga libera', secondoBis: 'un solo Bis', pausaDopoBis: 'niente pause dopo il Bis', troppe: 'massimo ' + Regole.MAX_SCALETTA + ' righe', doppione: 'riga doppia', id: 'identificativo', tipo: 'tipo di riga' }[c] || c;
}
function cambioScaletta() {
  clearTimeout(timerScaletta); timerScaletta = null;
  if (!io() || !scal.serata) return;
  const n = Regole.normalizzaScaletta(scal.righe.map(rigaPerMotore));
  document.querySelectorAll('#listaScaletta .invalido').forEach((x) => x.classList.remove('invalido'));
  if (n.errori.length) {
    n.errori.forEach((e) => {
      const rg = scal.righe[e.indice];
      if (rg) e.campi.forEach((c) => { const x = document.querySelector('#listaScaletta li[data-id="' + rg.id + '"] [data-campo="' + c + '"]'); if (x) x.classList.add('invalido'); });
    });
    statoSalva('da correggere', 'errore');
    mostra('esitoScaletta', 'Da correggere: ' + n.errori.map((e) => (e.indice >= 0 ? 'riga ' + (e.indice + 1) + ' — ' : '') + e.campi.map(nomeCampoRiga).join(', ')).join('; ') + '. Finché non è a posto la scaletta non si salva.', true);
    return;
  }
  if (!serataSalvata()) { statoSalva('serve la data', 'errore'); return; }
  if (!puoScrivere('esitoScaletta')) { statoSalva('serve la rete', 'errore'); return; }
  mostra('esitoScaletta', '');
  statoSalva('salvataggio…');
  timerScaletta = setTimeout(() => { timerScaletta = null; salvaScaletta(0); }, ATTESA_STRUTTURA_MS);
}
function testoAvvisoScaletta(a) {
  const parti = [];
  if (a.tenute) parti.push(a.tenute === 1 ? 'ho tenuto in fondo 1 riga che avevano aggiunto' : 'ho tenuto in fondo ' + a.tenute + ' righe che avevano aggiunto');
  if (a.cambiateDaAltri) parti.push(a.cambiateDaAltri === 1 ? '1 riga era stata cambiata o spostata: ora vale la tua versione' : a.cambiateDaAltri + ' righe erano state cambiate o spostate: ora vale la tua versione');
  if (a.ricreate) parti.push(a.ricreate === 1 ? '1 riga che era stata tolta è tornata, perché c’era ancora nella tua' : a.ricreate + ' righe che erano state tolte sono tornate, perché c’erano ancora nella tua');
  return 'Attenzione: ' + (a.modificatoDa || 'un altro') + ' ha modificato la scaletta' + (a.modificatoIl ? ' il ' + dataOra(a.modificatoIl) : '') + '. ' + parti.join('; ') + '. Controllate insieme.';
}
async function salvaScaletta(tentativo) {
  if (scalettaInCorso) { scalettaDiNuovo = true; return; }
  if (!scal.serata || !serataSalvata()) return;
  const lista = scal.righe.map(rigaPerMotore);
  if (Regole.normalizzaScaletta(lista).errori.length) return;
  scalettaInCorso = true;
  const serataId = scal.serata, conosciute = scal.conosciute;
  const note = {}; lista.forEach((x) => { note[x.id] = true; }); conosciute.forEach((x) => { note[x.id] = true; });
  try {
    const j = await chiama('salvaScaletta', { serata: serataId, righe: lista, conosciute });
    if (!j.ok) {
      statoSalva('non salvato', 'errore');
      mostra('esitoScaletta', 'Scaletta non salvata: ' + (j.righe ? j.righe.map((e) => e.campi.map(nomeCampoRiga).join(', ')).join('; ') : j.errore), true);
      return;
    }
    const r = risposta();
    r.scalette = (r.scalette || []).filter((x) => x.serata !== serataId).concat(j.righe);
    salvaCopia();
    if (scal.serata === serataId) {
      scal.conosciute = j.righe.map((x) => ({ id: x.id, versione: x.versione }));
      // come la struttura: si aggiornano gli oggetti esistenti; le righe tenute perché aggiunte da altri si accodano;
      // quelle di brani eliminati nel frattempo (scartate dal motore) spariscono
      const ricevute = {}; j.righe.forEach((x) => { ricevute[x.id] = x; });
      if (j.braniSpariti) scal.righe = scal.righe.filter((x) => ricevute[x.id]);
      const locali = {}; scal.righe.forEach((x) => { locali[x.id] = x; });
      let accodate = 0;
      j.righe.forEach((x) => {
        if (locali[x.id]) locali[x.id].versione = x.versione;
        else if (!note[x.id]) { scal.righe.push(copiaRiga(x)); accodate++; }
      });
      if (accodate || j.braniSpariti) disegnaScaletta(); else aggiornaVistaScaletta();   // righe degli altri: si vedono subito
    }
    disegnaSerate();
    statoSalva('salvato ✓', 'salvato');
    if (j.avviso) mostra('esitoScaletta', testoAvvisoScaletta(j.avviso), true);
    else if (j.braniSpariti) mostra('esitoScaletta', (j.braniSpariti === 1 ? '1 brano era stato eliminato dal repertorio: l’ho tolto' : j.braniSpariti + ' brani erano stati eliminati dal repertorio: li ho tolti') + ' dalla scaletta.', true);
  } catch (e) {
    if (e instanceof ErroreRete && tentativo < 2 && navigator.onLine) {
      statoSalva('riprovo…'); scalettaInCorso = false;
      setTimeout(() => salvaScaletta(tentativo + 1), tentativo ? 5000 : 2000);
      return;
    }
    statoSalva('non salvato: serve la rete', 'errore');
    mostra('esitoScaletta', 'Scaletta non salvata: ' + e.message + '. Le modifiche restano su questa schermata finché non la lasci.', true);
  } finally {
    scalettaInCorso = false;
    if (scalettaDiNuovo) { scalettaDiNuovo = false; salvaScaletta(0); }
  }
}

/* Scelta dei brani: si aggiungono nell'ordine in cui si toccano */
function apriScegli() {
  if (!puoScrivere('esitoScaletta')) return;
  scelti = []; $('scegliCerca').value = '';
  disegnaScegli(); vai('vScegli');
}
function disegnaScegli() {
  const ul = $('listaScegli'); ul.textContent = '';
  const q = $('scegliCerca').value.trim().toLowerCase();
  const gia = {}; scal.righe.forEach((x) => { if (x.tipo === 'brano') gia[x.brano] = true; });
  brani().slice().sort((a, b) => String(a.titolo).localeCompare(String(b.titolo), 'it', { sensitivity: 'base' }))
    .filter((b) => !q || (b.titolo + ' ' + (b.artista || '')).toLowerCase().includes(q))
    .forEach((b) => {
      const k = scelti.indexOf(b.id);
      const li = el('li'); const bt = el('button', k >= 0 ? 'scelto' : ''); bt.type = 'button'; bt.dataset.id = b.id;
      const tx = el('span', 'tx'); tx.append(el('b', '', b.titolo), el('span', 'tenue piccolo', b.artista ? ' · ' + b.artista : ''));
      bt.append(el('span', 'ordine', k >= 0 ? String(k + 1) : ''), tx);
      if (gia[b.id]) bt.append(el('span', 'gia', 'già in scaletta'));
      bt.addEventListener('click', () => { const i = scelti.indexOf(b.id); if (i >= 0) scelti.splice(i, 1); else scelti.push(b.id); disegnaScegli(); });
      li.append(bt); ul.append(li);
    });
  if (!brani().length) ul.append(el('li', 'tenue', 'Il repertorio è vuoto: prima aggiungi i brani.'));
  $('btnScegliOk').textContent = scelti.length ? 'Aggiungi ' + testoBrani(scelti.length) : 'Aggiungi';
  $('btnScegliOk').disabled = !scelti.length || senzaRete();
}
$('btnAggBrani').addEventListener('click', apriScegli);
$('scegliCerca').addEventListener('input', disegnaScegli);
$('btnScegliIndietro').addEventListener('click', () => vai('vSerata'));
$('btnScegliOk').addEventListener('click', () => {
  if (!scelti.length) return;
  vai('vSerata');
  aggiungiRighe(scelti.map((id) => ({ tipo: 'brano', brano: id })), false);
  scelti = [];
});

/* Duplica ed elimina */
$('btnDuplica').addEventListener('click', () => {
  if (!io() || !serataAperta || !puoScrivere('esitoSerata')) return;
  const righe = scal.righe.map((x) => Object.assign(copiaRiga(x), { id: nuovoIdBrano(), versione: 0 }));
  serataAperta = { id: nuovoIdBrano(), versione: 0, data: '', locale: serataAperta.locale, localeId: serataAperta.localeId || '', orario: serataAperta.orario, note: serataAperta.note };
  scal = { serata: serataAperta.id, righe, conosciute: [], aperta: null };
  riempiSerata();
  window.scrollTo(0, 0);
  mostra('esitoSerata', 'Copia della serata: scrivi la data e si salva con tutta la scaletta.');
  $('sData').focus();
});
$('btnEliminaSerata').addEventListener('click', () => chiediConferma($('btnEliminaSerata'), async () => {
  if (!puoScrivere('esitoSerata') || !serataAperta) return;
  const id = serataAperta.id;
  try {
    const j = await chiama('eliminaSerata', { serata: id });
    if (!j.ok) return mostra('esitoSerata', 'Non eliminata: ' + j.errore, true);
    const r = risposta();
    r.serate = (r.serate || []).filter((s) => s.id !== id);
    r.scalette = (r.scalette || []).filter((s) => s.serata !== id);
    salvaCopia(); memoria.del('serataAperta'); serataAperta = null;
    disegnaSerate(); vai('vSerate');
    statoSalva('eliminata ✓', 'salvato');
    mostra('esitoSerate', 'Serata eliminata (resta traccia nello Storico).');
  } catch (e) { mostra('esitoSerata', 'Non eliminata: ' + e.message, true); }
}));

/* ---------- T7 · Foglio stampato ----------
 * Un A4 uguale per tutti: titoli grandi da 32 pt in giù finché tutto sta in una pagina (non sotto 22 pt);
 * se non basta, una pagina per set (il salto cade sulla Pausa). La misura si fa sul foglio vero dell'anteprima,
 * largo 186 mm come il testo stampato: anteprima e stampa coincidono. */
const FS_MAX = 32, FS_MIN = 22;
function righello() {
  let r = $('righello');
  if (!r) { r = el('div'); r.id = 'righello'; document.body.append(r); }
  return r.offsetHeight;          // 273 mm (297 − 2 × 12 di margine) in pixel
}
function testaFoglio(s, seguito, nPagina) {
  if (seguito) return el('div', 'seguito', nPagina + '° set · ' + dataSerata(s, true) + (s.locale ? ' · ' + s.locale : ''));
  const t = el('div', 'testa-f');
  const img = el('img'); img.src = 'logo/logo-dish-chiaro-scritta.svg'; img.alt = 'Dish for a King';
  const tt = el('div', 'tit-f'); tt.append(el('b', '', 'Scaletta'), el('span', '', [dataSerata(s), s.locale, s.orario ? 'ore ' + s.orario : ''].filter(Boolean).join(' · ')));
  t.append(img, tt); return t;
}
function righeFoglio(s, indici, rp, ctx) {
  const out = [], perId = {}; brani().forEach((b) => { perId[b.id] = b; });
  const notaz = impostazioni().notazione, piuSet = rp.sets.length > 1;
  const nomeSet = (k) => (piuSet || rp.bis ? k + '° set' : 'Set');
  indici.forEach((i) => {
    const x = scal.righe[i], info = rp.perRiga[i] || {};
    if (x.tipo === 'brano') {
      const b = perId[x.brano] || { titolo: '(brano tolto)' };
      const rs = Regole.rigaStampa(b, ctx.precedente, notaz); ctx.precedente = b;
      const r = el('div', 'r brano');
      r.append(el('span', 'num', String(info.numero)), el('span', 'tit', rs.titolo), el('span', 'ton', rs.tonalita), el('span', 'bpm', rs.bpm), el('span', 'acc' + (rs.accordatura ? '' : ' vuota'), rs.accordatura));
      if (!rs.accordatura) r.lastChild.style.border = '0';
      if (x.nota) r.append(el('span', 'nota', x.nota));
      out.push(r);
    } else if (x.tipo === 'libera') {
      const r = el('div', 'r libera');
      r.append(el('span', 'num', '›'), el('span', 'tit', x.nota), el('span', 'min', x.minuti ? x.minuti + ' min' : ''));
      out.push(r);
    } else {
      const d = el('div', 'div ' + x.tipo);
      const set = x.tipo === 'pausa' ? rp.sets[info.set - 1] : rp.sets[rp.sets.length - 1];
      const ds = set ? Regole.scriviDurataSet(set) : '';
      d.append(el('span', '', x.tipo === 'pausa' ? 'Pausa ' + x.minuti + ' min' : 'Bis'), el('span', '', set && ds ? nomeSet(set.numero) + ' ' + ds : ''));
      out.push(d);
    }
  });
  return out;
}
function piedeFoglio(rp) {
  const p = el('div', 'piede'), ultimo = rp.sets[rp.sets.length - 1];
  if (!rp.bis && rp.sets.length > 1 && ultimo) p.append(el('span', '', ultimo.numero + '° set ' + Regole.scriviDurataSet(ultimo)));
  if (rp.bis) p.append(el('span', '', 'Bis ' + Regole.scriviDurataSet(rp.bis)));
  p.append('Totale ' + (Regole.scriviDurataSet(rp.totale) || '—'));
  return p;
}
/** (non ovvio) Si lascia il 3 % di margine (circa 8 mm): la stampa di Chrome arrotonda le righe in modo leggermente diverso dallo schermo. */
const RISERVA = 0.97, FS_SENZA_A_CAPO = 26;
/** Un titolo che va su due righe si legge peggio: se serve si scende fino a 26 pt per tenerli tutti su una riga. */
function titoliACapo(pagina) {
  return Array.from(pagina.querySelectorAll('.r .tit')).some((t) => t.offsetHeight > 1.5 * parseFloat(getComputedStyle(t).lineHeight));
}
function adatta(pagina, alto) {
  for (let fs = FS_MAX; fs >= FS_MIN; fs--) {
    pagina.style.setProperty('--fs', fs + 'pt');
    if (pagina.offsetHeight <= alto * RISERVA && (fs <= FS_SENZA_A_CAPO || !titoliACapo(pagina))) return fs;
  }
  return FS_MIN;
}
function costruisciFoglio() {
  const s = serataAperta, f = $('foglioStampa'); f.textContent = ''; f.style.transform = '';
  const rp = riepilogoDi(scal.righe, s.orario);
  const alto = righello();
  const tutte = scal.righe.map((x, i) => i);
  // 1) tutto in una pagina
  let pag = el('div', 'pagina');
  pag.append(testaFoglio(s), ...righeFoglio(s, tutte, rp, { precedente: null }), piedeFoglio(rp));
  f.append(pag);
  const fs = [adatta(pag, alto)];
  // 2) non sta a 22 pt: una pagina per set (la Pausa chiude la pagina; il bis va con l'ultimo set)
  if (pag.offsetHeight > alto * RISERVA && scal.righe.some((x) => x.tipo === 'pausa')) {
    f.textContent = ''; fs.length = 0;
    const gruppi = [[]];
    scal.righe.forEach((x, i) => { gruppi[gruppi.length - 1].push(i); if (x.tipo === 'pausa' && !rp.perRiga[i].inBis) gruppi.push([]); });
    if (gruppi.length > 1 && !gruppi[gruppi.length - 1].length) gruppi.pop();
    const ctx = { precedente: null };
    gruppi.forEach((g, k) => {
      pag = el('div', 'pagina');
      pag.append(testaFoglio(s, k > 0, k + 1), ...righeFoglio(s, g, rp, ctx));
      if (k === gruppi.length - 1) pag.append(piedeFoglio(rp));
      f.append(pag); fs.push(adatta(pag, alto));
    });
  }
  const pagine = f.querySelectorAll('.pagina');
  f.dataset.pagine = pagine.length;
  f.dataset.fs = fs.join(',');
  f.dataset.oltre = Array.from(pagine).some((p) => p.offsetHeight > alto * RISERVA) ? '1' : '';
  scalaAnteprima();
  const info = $('stampaInfo');
  info.textContent = 'Il foglio esce così' + (pagine.length > 1 ? ' (' + pagine.length + ' pagine, una per set)' : '') + '. Dalla finestra di stampa scegli la stampante oppure "Salva come PDF".'
    + (f.dataset.oltre ? ' La scaletta è molto lunga: a 22 pt non sta tutta, il resto va sulla pagina dopo.' : '');
}
function scalaAnteprima() {
  const f = $('foglioStampa'), box = $('anteprima');
  f.style.transform = '';
  const sc = Math.min(1, box.clientWidth / f.offsetWidth);
  f.style.transform = 'scale(' + sc + ')';
  box.style.height = Math.ceil(f.offsetHeight * sc) + 'px';
}
function apriStampa() {
  if (!serataAperta) return;
  vai('vStampa');
  document.title = nomeFileStampa(serataAperta);
  costruisciFoglio();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!$('vStampa').hidden) costruisciFoglio(); });
}
$('btnAnteprima').addEventListener('click', apriStampa);
$('btnStampaIndietro').addEventListener('click', () => vai('vSerata'));
/**
 * Variante T7 (15/11/2026, scelta A): il nome proposto da "Salva come PDF" è il titolo della pagina, quindi
 * nell'anteprima il titolo diventa "2026-12-12 Bar Test - Scaletta Dish for a King" (data prima: i file si
 * ordinano da soli per serata). Senza i caratteri vietati nei nomi dei file.
 * (non ovvio) Il titolo resta finché si è nell'anteprima e torna uscendo, non all'evento "afterprint":
 * su Android la stampa non blocca la pagina e "afterprint" può arrivare prima che il sistema legga il nome.
 */
const TITOLO_APP = 'Dish for a King';
function nomeFileStampa(s) {
  const locale = String((s && s.locale) || '').replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return [(s && s.data) || '', locale].filter(Boolean).join(' ') + ' - Scaletta Dish for a King';
}
$('btnStampa').addEventListener('click', () => { if (serataAperta) document.title = nomeFileStampa(serataAperta); window.print(); });
window.addEventListener('resize', () => { if (!$('vStampa').hidden) scalaAnteprima(); });

/* ---------- T8 · Modalità Palco e file per la serata (progetto approvato il 15/11/2026: D1 A, D2 A, D3 A, D4 A) ----------
 * Chi fa avanzare la sezione corrente è una "sorgente": 'mano' (‹ ›, tocco sulla sezione) o 'metronomo' (il click
 * della T6 su questo telefono). La T8-sync aggiungerà la sorgente 'remota' (lo start che arriva dal telefono di
 * Francesco), che userà Regole.sezioneAlTempo senza cambiare questa schermata.
 */
let palco = null;   // { voci, i, corrente, poi, da: 'serata' | 'brano', serata, suona, sorgente, piano, sezioni, conta }
// T8-sync: stato del sincronismo (vedi il blocco T8-sync più sotto)
const sync = { diretta: false, ultimo: null, collegato: false, caricato: false, staccato: false, giro: null, scaduto: null, partenza: null, testoStato: '', fuoriDa: 0 };
const sezioniDi = (id) => sezioniTutte().filter((x) => x.brano === id).sort((a, b) => a.ordine - b.ordine);
const branoDi = (id) => brani().find((b) => b.id === id) || null;

/** Righe della serata come sono adesso sul telefono (anche con una modifica non ancora salvata). */
function righeSerataCorrenti() {
  if (!serataAperta) return [];
  return scal.serata === serataAperta.id ? scal.righe : righeDi(serataAperta.id);
}
function apriPalco(voci, da, serataId) {
  voci = (voci || []).filter((v) => branoDi(v.brano));
  if (!voci.length) return false;
  palco = { voci, i: 0, corrente: 0, poi: false, da, serata: serataId || null, suona: false, sorgente: 'mano', conta: null };
  memoria.set('palcoDa', da);
  vai('vPalco');
  disegnaPalco();
  syncApri();   // T8-sync: solo per il palco di una serata (D6)
  return true;
}
function caricaBranoPalco() {
  const v = palco.voci[palco.i], b = branoDi(v.brano);
  palco.sezioni = sezioniDi(v.brano);
  palco.piano = Regole.pianoPalco(b, palco.sezioni, { conteggio: opzioniMetro().conteggio });
  palco.corrente = 0; palco.poi = false; palco.conta = null;
}
function disegnaPalco() {
  if (!palco) return;
  caricaBranoPalco();
  const imp = impostazioni(), me = io();
  const v = palco.voci[palco.i], b = branoDi(v.brano), prima = palco.i ? branoDi(palco.voci[palco.i - 1].brano) : null;
  const rs = Regole.rigaStampa(b, prima, imp.notazione);
  $('vPalco').dataset.car = Regole.CARATTERI_PALCO[imp.caratteriPalco] ? imp.caratteriPalco : 'Molto grandi';
  $('pPosizione').textContent = palco.voci.length > 1 ? (palco.i + 1) + '/' + palco.voci.length : '';
  $('pTitolo').textContent = rs.titolo;
  $('pInfo').textContent = [rs.tonalita, rs.bpm, rs.accordatura].filter(Boolean).join(' · ');
  $('pNota').textContent = v.nota; $('pNota').hidden = !v.nota;
  $('pModo').textContent = palco.piano.modo === 'mano' ? palco.piano.motivo : '';
  $('pModo').hidden = palco.piano.modo !== 'mano';
  $('pPrima').textContent = v.prima.map(Regole.scriviRigaSpeciale).join(' · '); $('pPrima').hidden = !v.prima.length;
  const ultimo = palco.i === palco.voci.length - 1;
  $('pDopo').textContent = v.dopo.length ? 'dopo: ' + v.dopo.map(Regole.scriviRigaSpeciale).join(' · ') : (palco.voci.length > 1 && ultimo ? 'fine della scaletta' : '');
  const ol = $('pSezioni'); ol.textContent = '';
  const nomi = Regole.nomiSezioni(palco.sezioni);
  if (!palco.sezioni.length) ol.append(el('li', 'vuota', 'Struttura non ancora scritta.'));
  palco.sezioni.forEach((x, k) => {
    const li = el('li', 'sezp'); li.dataset.indice = k;
    const mia = me ? (Regole.leggiChiSuona(x.chiSuona) || {})[me.sigla] : '';
    if (mia === 'tacet') li.classList.add('mio-tacet');
    const r1 = el('div', 'r1'); r1.append(el('b', 'nome', nomi[k] + (Number(x.ripetizioni) > 1 ? ' ×' + x.ripetizioni : '')));
    const g = Regole.gruppiChiSuona(x.chiSuona);
    const segno = (sigla, tipo) => el('span', 'eccez ' + tipo + (imp.evidenziaSoloMe ? (me && me.sigla === sigla ? ' mia' : ' altri') : ''), (tipo === 'tacet' ? 'tacet ' : '★ ') + sigla);
    g.tacet.forEach((sg) => r1.append(segno(sg, 'tacet')));
    g.stella.forEach((sg) => r1.append(segno(sg, 'stella')));
    li.append(r1);
    if (x.nota) li.append(el('span', 'notasez', x.nota));
    const t = testoDi(x.testo);
    if (t && t.testo) { li.append(el('span', 'prima', Regole.primaRiga(t.testo))); li.append(el('p', 'parole', t.testo)); }   // D1 A: testo completo nella sezione corrente, per tutti
    li.append(el('p', 'poi', ''));
    li.addEventListener('click', () => { syncStacca(); palcoVaiSezione(k, false, 'mano'); });
    ol.append(li);
  });
  aggiornaSezionePalco(true);
  aggiornaComandiPalco();
  syncBarra();
  window.scrollTo(0, 0);
}
/** Sposta la sezione corrente (k) e accende o spegne "poi: …". */
function palcoVaiSezione(k, poi, sorgente) {
  if (!palco || !palco.sezioni.length) return;
  k = Math.max(0, Math.min(palco.sezioni.length - 1, k));
  const cambia = k !== palco.corrente;
  palco.corrente = k; palco.poi = !!poi && k < palco.sezioni.length - 1;
  if (sorgente) palco.sorgente = sorgente;
  aggiornaSezionePalco(cambia);
}
function aggiornaSezionePalco(scorri) {
  const nomi = Regole.nomiSezioni(palco.sezioni);
  document.querySelectorAll('#pSezioni li.sezp').forEach((li) => {
    const k = Number(li.dataset.indice), cur = k === palco.corrente;
    li.classList.toggle('corrente', cur);
    li.classList.toggle('con-poi', cur && palco.poi);
    const poi = li.querySelector('.poi');
    if (cur && palco.sezioni[k + 1]) {
      const t = testoDi(palco.sezioni[k + 1].testo);
      poi.textContent = 'poi: ' + nomi[k + 1] + (t && t.testo ? ' — ' + Regole.primaRiga(t.testo).replace(/ …$/, '') : '');
    } else poi.textContent = '';
  });
  if (scorri) {
    const li = document.querySelector('#pSezioni li.corrente');
    $('vPalco').style.setProperty('--alto-testa', ($('palcoTesta').offsetHeight + 8) + 'px');
    if (li && palco.corrente > 0) li.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
function aggiornaComandiPalco() {
  if (!palco) return;
  const st = $('pStart'), attivo = metroAttivo();
  const p = palco.sezioni ? Regole.pianoMetronomo(branoDi(palco.voci[palco.i].brano), palco.sezioni, opzioniMetro()) : null;
  st.hidden = !attivo || syncInDiretta();   // T8-sync D2 A: chi segue la batteria non ha lo start (anche se staccato)
  st.disabled = !palco.suona && (!p || p.modo === 'nessuno');
  st.classList.toggle('suona', palco.suona);
  const nomi = Regole.nomiSezioni(palco.sezioni || []);
  st.textContent = palco.suona ? '■ Stop' : palco.corrente > 0 && p && p.modo === 'struttura' ? '▶ da ' + nomi[palco.corrente] : '▶ Start';
  $('pSezPrec').disabled = !palco.sezioni.length || palco.corrente === 0;
  $('pSezSucc').disabled = !palco.sezioni.length || palco.corrente >= palco.sezioni.length - 1;
  $('pBranoPrec').disabled = palco.i === 0;
  $('pBranoSucc').disabled = palco.i >= palco.voci.length - 1;
  $('pBranoPrec').hidden = $('pBranoSucc').hidden = palco.voci.length < 2;
  $('pStato').textContent = palco.suona ? (palco.sorgente === 'metronomo' ? 'segue il click' : 'click libero: sezioni a mano') : (p && p.modo === 'nessuno' ? 'manca il BPM' : '');
  if (syncSegueAttivo() && sync.testoStato) $('pStato').textContent = sync.testoStato;
}
function palcoBrano(d) {
  if (!palco) return;
  const n = palco.i + d;
  if (n < 0 || n >= palco.voci.length) return;
  if (palco.suona) metro.ferma();
  palco.i = n; palco.sorgente = 'mano';
  syncStacca();
  disegnaPalco();
  syncInvia('pronto');   // D1 A: sveglia la rete e porta gli altri sul brano
}
/** ▶ Start: il click della T6 dalla sezione corrente (dall'inizio se è la prima), al tempo scritto (100%). */
function palcoStart() {
  if (!palco) return;
  if (palco.suona) { metro.ferma(); return; }
  const b = branoDi(palco.voci[palco.i].brano), sez = palco.sezioni;
  const da = palco.corrente > 0 && sez[palco.corrente] ? sez[palco.corrente].id : undefined;
  const p = Regole.pianoMetronomo(b, sez, Object.assign(opzioniMetro(), { daSezione: da }));
  if (!p || p.modo === 'nessuno' || !p.tratti.length) return;
  if (metro.inCorso()) metro.ferma();
  metroDove = 'palco'; metroBrano = b.id;
  palco.suona = true; palco.sorgente = p.modo === 'struttura' ? 'metronomo' : 'mano';
  sync.partenza = sync.diretta ? { da: da || '' } : null;   // T8-sync: il messaggio parte al primo colpo udibile
  aggiornaComandiPalco();
  metro.avvia(p, { tempo: 100, volume: impostazioni().metronomoVolume })
    .catch(() => { palco.suona = false; metroDove = null; aggiornaComandiPalco(); mostra('avvisoCodice', 'Questo telefono non ha aperto l\'audio: tocca di nuovo ▶.', true); });
}
metro.su('battuta', (a) => {
  if (!palco || !palco.suona || palco.sorgente !== 'metronomo') return;
  const k = palco.sezioni.findIndex((x) => x.id === a.sezione);
  if (a.conteggio) return;   // durante il conteggio resta la sezione da cui si parte
  if (k < 0) return;
  const s = palco.piano.sezioni.find((x) => x.sezione === a.sezione);
  // D2 A: "poi: …" nell'ultima battuta, ma per almeno 2 secondi (a tempi veloci più di una battuta)
  const poi = !!(a.prossimo && s && a.prossimo.tra <= s.battutePoi);
  if (k !== palco.corrente || poi !== palco.poi) palcoVaiSezione(k, poi);
});
metro.su('colpo', (c) => {
  if (!palco || !palco.suona) return;
  if (sync.partenza) { const x = sync.partenza; sync.partenza = null; syncInvia('start', x.da); }
  const n = $('pConta');
  n.hidden = !c.conteggio;
  if (c.conteggio) n.textContent = String(c.numero);
});
metro.su('fermo', (f) => {
  if (!palco || !palco.suona) return;
  palco.suona = false; $('pConta').hidden = true;
  // D4 A: a fine brano il click si ferma e il brano successivo resta pronto per lo start
  sync.partenza = null;
  if (f && f.fine && palco.i < palco.voci.length - 1) { palco.i++; palco.sorgente = 'mano'; disegnaPalco(); syncInvia('pronto'); }
  else { palco.poi = false; aggiornaSezionePalco(false); aggiornaComandiPalco(); syncInvia('fermo'); }
});
$('pStart').addEventListener('click', palcoStart);
$('pSezPrec').addEventListener('click', () => { if (palco) { syncStacca(); palcoVaiSezione(palco.corrente - 1, false, palco.suona ? palco.sorgente : 'mano'); aggiornaComandiPalco(); } });
$('pSezSucc').addEventListener('click', () => { if (palco) { syncStacca(); palcoVaiSezione(palco.corrente + 1, false, palco.suona ? palco.sorgente : 'mano'); aggiornaComandiPalco(); } });
$('pSezioni').addEventListener('click', () => aggiornaComandiPalco());
$('pBranoPrec').addEventListener('click', () => palcoBrano(-1));
$('pBranoSucc').addEventListener('click', () => palcoBrano(1));
$('btnPalcoEsci').addEventListener('click', () => {
  const da = palco && palco.da;
  if (palco && palco.suona) metro.ferma();
  syncChiudi();   // T8-sync: uscendo dal palco la diretta finisce ("fine")
  palco = null;
  if (da === 'brano' && branoAperto) vai('vBrano');
  else if (da === 'serata' && serataAperta) vai('vSerata');
  else vai('vInizio');
});
// Ingressi: scheda brano, scheda serata, riquadro "Prossima serata"
$('btnPalcoBrano').addEventListener('click', () => {
  if (!branoAperto || !branoDi(branoAperto.id)) return mostra('esitoBrano', 'Il palco si apre quando il brano è salvato.', true);
  apriPalco([{ brano: branoAperto.id, nota: '', prima: [], dopo: [] }], 'brano');
});
$('btnPalcoSerata').addEventListener('click', () => {
  if (!serataAperta) return;
  if (!apriPalco(Regole.vociPalco(righeSerataCorrenti(), branoDi), 'serata', serataAperta.id)) mostra('esitoSerata', 'Prima aggiungi dei brani alla scaletta.', true);
});
$('btnPalcoProssima').addEventListener('click', () => {
  const id = $('riquadroProssima').dataset.id;
  if (!id) return;
  apriSerata(id);
  if (!apriPalco(Regole.vociPalco(righeDi(id), branoDi), 'serata', id)) mostra('esitoSerata', 'Prima aggiungi dei brani alla scaletta.', true);
});
function aggiornaIngressiPalco() {
  const id = $('riquadroProssima').dataset.id;
  $('btnPalcoProssima').hidden = $('riquadroProssima').hidden || !id || !Regole.vociPalco(righeDi(id), branoDi).some((v) => branoDi(v.brano));
}

/* ---------- T8-sync · Palco sincronizzato (progetto approvato il 16/11/2026: D1–D6 tutte A) ----------
 * Doppio consenso (D6): il telefono DRUM manda messaggi solo "📡 In diretta" (spenta all'apertura, proposta il
 * giorno della serata); gli altri seguono solo dopo "Segui", e solo nel palco della stessa serata.
 * Il canale è sync.js (Firebase), caricato solo qui (D5 A). Le decisioni stanno nelle regole (vistaSync), qui
 * solo schermo e tasti. La batteria segue il proprio click come nella T8; gli altri calcolano dall'istante.
 */
const sonoBatteria = () => { const me = io(); return !!(me && me.sigla === 'DRUM'); };
const configSync = () => { const r = risposta(); return (r && r.palcoSync && r.palcoSync.url && r.palcoSync.segreto) ? r.palcoSync : null; };
const chiaveSegui = () => 'segui-' + (palco && palco.serata);
function syncSegue() { return !!(palco && palco.serata && !sonoBatteria() && memoria.get(chiaveSegui())); }
function syncInDiretta() { return syncSegue() && !!(sync.ultimo && Regole.leggiMessaggio(sync.ultimo, { serata: palco.serata, oraServer: syncOra() }).vale); }
function syncSegueAttivo() { return syncInDiretta() && !sync.staccato; }
function syncOra() { return window.SyncPalco ? window.SyncPalco.oraServer() : Date.now(); }
function caricaSync() {
  if (window.SyncPalco) return Promise.resolve(true);
  return new Promise((ok) => {
    const s = document.createElement('script'); s.src = 'sync.js';
    s.onload = () => ok(!!window.SyncPalco); s.onerror = () => ok(false);
    document.head.append(s);
  });
}
function syncApri() {
  Object.assign(sync, { diretta: false, ultimo: null, collegato: false, staccato: false, partenza: null, testoStato: '' });
  const cfg = configSync();
  if (!palco || !palco.serata || !cfg) { syncBarra(); return; }
  const serata = palco.serata;
  caricaSync().then((ok) => {
    if (!ok || !palco || palco.serata !== serata) { syncBarra(); return; }
    window.SyncPalco.apri({ url: cfg.url, segreto: cfg.segreto, serata }, syncRicevi, (st) => {
      sync.collegato = !!st.collegato;
      if (sync.collegato) sync.fuoriDa = 0; else if (!sync.fuoriDa) sync.fuoriDa = Date.now();
      syncAggiorna();
    });
    if (sync.diretta) syncInvia('diretta');   // diretta accesa prima che il canale fosse pronto
  });
  syncBarra();
}
function syncChiudi() {
  if (sync.diretta) syncInvia('fine');
  sync.diretta = false;
  if (sync.giro) cancelAnimationFrame(sync.giro);
  sync.giro = null;
  if (window.SyncPalco) setTimeout(() => window.SyncPalco.chiudi(), 1500);   // il tempo di far partire "fine"
}
/** DRUM: manda un evento, solo in diretta (D2 A, D6 A). Chi invia ignora la propria eco (non segue nessuno). */
function syncInvia(evento, daSezione) {
  if (!palco || !sync.diretta || !window.SyncPalco || !sonoBatteria()) return;
  const v = palco.voci[palco.i];
  const dati = { n: ((sync.ultimo && sync.ultimo.n) || 0) + 1, evento, serata: palco.serata, brano: evento === 'fine' ? '' : v.brano, voce: palco.i,
    daSezione: daSezione || '', tempo: 100, inviato: Math.round(syncOra()) };
  if (evento === 'start') {
    const pp = Regole.pianoPalco(branoDi(v.brano), palco.sezioni, Object.assign(opzioniMetro(), { daSezione: daSezione || undefined }));
    dati.inizio = Regole.inizioSync(syncOra(), pp, 100);   // syncOra() qui = primo colpo udibile del conteggio
  }
  const m = Regole.messaggioPalco(dati);
  if (!m) return;
  sync.ultimo = m;
  window.SyncPalco.invia(m).catch(() => { /* senza rete: il click va avanti lo stesso */ });
  syncBarra();
}
function syncRicevi(m) {
  if (!palco) return;
  if (sonoBatteria()) { if (Regole.messaggioValido(m) && (!sync.ultimo || m.n >= sync.ultimo.n)) sync.ultimo = m; return; }   // eco e numerazione
  const prima = sync.ultimo;
  sync.ultimo = Regole.messaggioValido(m) ? m : null;
  // D3 A: un nuovo start o un cambio di brano della batteria riattacca chi si era staccato
  if (sync.staccato && sync.ultimo && (!prima || sync.ultimo.n !== prima.n) && ['start', 'pronto'].includes(sync.ultimo.evento)) sync.staccato = false;
  if (sync.ultimo && !sync.ultimo.diretta) memoria.del(chiaveSegui());   // "fine diretta": tutti tornano indipendenti
  syncAggiorna();
}
/** Vista dei telefoni che seguono: calcolata dalle regole a ogni fotogramma mentre il brano scorre. */
function syncAggiorna() {
  if (sync.giro) cancelAnimationFrame(sync.giro);
  sync.giro = null;
  if (!palco || sonoBatteria()) { syncBarra(); return; }
  const m = sync.ultimo;
  const b = m && m.brano ? branoDi(m.brano) : null;
  const piano = b ? Regole.pianoPalco(b, sezioniDi(m.brano), { conteggio: '0', daSezione: m.daSezione || undefined }) : null;
  const v = Regole.vistaSync(m, piano, { serata: palco.serata, oraServer: syncOra(), segue: syncSegue(), staccato: sync.staccato, collegato: sync.collegato });
  sync.testoStato = '';
  if (['pronto', 'conteggio', 'sezione', 'fine', 'fermo', 'mano'].includes(v.stato)) {
    // sul brano della batteria (la voce indica quale, se lo stesso brano è due volte in scaletta)
    let k = palco.voci[v.voce] && palco.voci[v.voce].brano === v.brano ? v.voce : palco.voci.findIndex((x) => x.brano === v.brano);
    if (k >= 0 && k !== palco.i) { palco.i = k; disegnaPalco(); }
    const sezDa = m.daSezione ? palco.sezioni.findIndex((x) => x.id === m.daSezione) : 0;
    palco.sorgente = 'remota';
    if (v.stato === 'pronto') { palcoVaiSezione(Math.max(0, sezDa), false); sync.testoStato = 'pronto: aspetta lo start'; }
    else if (v.stato === 'conteggio') { palcoVaiSezione(Math.max(0, sezDa), false); $('pConta').hidden = false; $('pConta').textContent = String(v.mancano); }
    else if (v.stato === 'sezione' || v.stato === 'fine') {
      $('pConta').hidden = true;
      const id = piano.sezioni[v.indice] && piano.sezioni[v.indice].sezione, kk = palco.sezioni.findIndex((x) => x.id === id);
      if (kk >= 0) palcoVaiSezione(kk, v.poi);
      sync.testoStato = v.stato === 'fine' ? 'fine del brano' : 'segue la batteria';
    } else if (v.stato === 'fermo') { $('pConta').hidden = true; sync.testoStato = 'click fermo: sezioni a mano'; }
    else { $('pConta').hidden = true; sync.testoStato = piano && piano.motivo ? piano.motivo : 'scorrimento a mano'; }
    if (v.stato === 'conteggio' || v.stato === 'sezione') sync.giro = requestAnimationFrame(syncAggiorna);
  } else if (v.stato === 'collegamento') {
    // senza conferma del server non si usa la copia vecchia; dopo 5 s si dice che si scorre a mano
    sync.testoStato = sync.fuoriDa && Date.now() - sync.fuoriDa > 5000 ? 'senza rete: scorrimento a mano' : 'in collegamento…';
    clearTimeout(sync.scaduto); sync.scaduto = setTimeout(syncAggiorna, 5200);
  }
  syncBarra();
  if (sync.testoStato !== sync.testoPrima) { sync.testoPrima = sync.testoStato; aggiornaComandiPalco(); }
}
/** Barra del sincronismo: spia, testo e un tasto che cambia con la situazione. */
function syncBarra() {
  const barra = $('pSyncBarra'), tasto = $('pSyncTasto'), t = $('pSyncTesto');
  if (!barra) return;
  const cfg = palco && palco.serata && configSync();
  barra.hidden = !cfg; $('pSync').hidden = true;
  if (!cfg) return;
  const collegato = sync.collegato, spia = collegato ? 'si' : 'no';
  barra.dataset.spia = spia;
  if (sonoBatteria()) {
    const s = serateTutte().find((x) => x.id === palco.serata), oggi = s && s.data === oggiLocale();
    if (sync.diretta) { t.textContent = '📡 ● diretta' + (collegato ? '' : ' (senza rete: il click va avanti)'); tasto.textContent = 'Spegni diretta'; }
    else { t.textContent = oggi ? 'Serata di oggi: vai in diretta?' : 'Diretta spenta: nessuno vede i tuoi start'; tasto.textContent = '📡 In diretta'; }
    tasto.dataset.azione = sync.diretta ? 'spegni' : 'accendi';
    $('pSync').hidden = !sync.diretta; $('pSync').textContent = '📡'; $('pSync').dataset.spia = spia;
    return;
  }
  const vale = sync.ultimo && Regole.leggiMessaggio(sync.ultimo, { serata: palco.serata, oraServer: syncOra() }).vale;
  if (!vale) { barra.hidden = true; return; }   // nessuna diretta: il palco resta quello della T8 (D6)
  if (!syncSegue()) { t.textContent = 'La batteria è in diretta'; tasto.textContent = 'Segui'; tasto.dataset.azione = 'segui'; }
  else if (sync.staccato) { t.textContent = 'staccato: scorri a mano'; tasto.textContent = '↺ segui la batteria'; tasto.dataset.azione = 'riattacca'; }
  else { t.textContent = '● ' + (sync.testoStato || 'segue la batteria'); tasto.textContent = 'Non seguire più'; tasto.dataset.azione = 'smetti'; }
  $('pSync').hidden = !syncSegue(); $('pSync').textContent = '●'; $('pSync').dataset.spia = spia;
}
/** D3 A: chi segue e tocca ‹ › o una sezione si stacca fino al prossimo start o cambio di brano. */
function syncStacca() {
  if (syncSegueAttivo()) { sync.staccato = true; if (sync.giro) cancelAnimationFrame(sync.giro); sync.giro = null; $('pConta').hidden = true; sync.testoStato = ''; syncBarra(); }
}
$('pSyncTasto').addEventListener('click', () => {
  if (!palco) return;
  const a = $('pSyncTasto').dataset.azione;
  if (a === 'accendi') { sync.diretta = true; syncInvia('diretta'); }
  else if (a === 'spegni') { syncInvia('fine'); sync.diretta = false; }
  else if (a === 'segui') { memoria.set(chiaveSegui(), true); sync.staccato = false; }
  else if (a === 'smetti') { memoria.del(chiaveSegui()); sync.staccato = false; $('pConta').hidden = true; palco.sorgente = 'mano'; }
  else if (a === 'riattacca') sync.staccato = false;
  sync.testoPrima = null;
  syncAggiorna();
  aggiornaComandiPalco();
});

/* File "Prepara per la serata": un HTML unico, senza JavaScript, scuro con il logo scuro (D3 A), personale. */
function dataOraFile() { return new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
async function scaricaFilePalco() {
  if (!serataAperta) return;
  const righe = righeSerataCorrenti();
  if (!Regole.vociPalco(righe, branoDi).length) return mostra('esitoSerata', 'Prima aggiungi dei brani alla scaletta.', true);
  let logo = '';
  try { logo = await (await fetch('logo/logo-dish-scuro-scritta.svg')).text(); } catch (e) { logo = ''; }   // dalla memoria offline: va anche senza rete
  logo = logo.replace(/^<\?xml[^>]*>\s*/, '');
  const r = risposta() || {}, imp = impostazioni(), me = io();
  const testo = Regole.fileSerata({ serata: serataAperta, righe, brani: brani(), sezioni: r.sezioni || [], testi: r.testi || [], notazione: imp.notazione,
    sigla: me ? me.sigla : '', evidenziaSoloMe: !!imp.evidenziaSoloMe, caratteri: imp.caratteriPalco, logo, generato: dataOraFile() });
  const nome = Regole.nomeFileSerata(serataAperta, 'Palco') + '.html';
  const url = URL.createObjectURL(new Blob([testo], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  mostra('esitoSerata', 'File "' + nome + '" scaricato (' + Math.round(testo.length / 1024) + ' KB): si apre dalla cartella Download, anche in modalità aereo.');
}
$('btnFilePalco').addEventListener('click', scaricaFilePalco);

/* ---------- Partenza: subito dalla copia sul telefono, poi una chiamata ---------- */
$('versioneMotore').textContent = stato.motore;
disegna();
aggiornaRete();
avvia();

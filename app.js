/* DFAK – Repertorio · comportamento dell'app e chiamate al motore (T2 Repertorio e scheda brano, T3 Struttura a sezioni, T5 Testi e bacheca,
 * T6 Metronomo e schermo sempre acceso). */
'use strict';

const VERSIONE_INTERFACCIA = 4;   // il motore rifiuta interfacce più vecchie della sua minima
const MOTORE_MINIMO = 4;          // l'app non scrive su motori più vecchi di questo (T5: testi, foto, bacheca)
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
  admin: false,
  membriAdmin: null
};
const risposta = () => stato.dati && stato.dati.risposta;
const io = () => { const r = risposta(); return r && r.io; };
const brani = () => { const r = risposta(); return (r && r.brani) || []; };
const statiStudio = () => { const r = risposta(); return (r && r.statiStudio) || []; };
function impostazioni() { const r = risposta(); return (r && r.impostazioni) || Regole.predefinite(); }
function salvaCopia() { if (stato.dati) memoria.set('dati', stato.dati); }

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
  $('campiBrano').disabled = fuori || !io();
  $('btnNuovo').disabled = fuori;
  document.querySelectorAll('#mioStato button').forEach((b) => { b.disabled = fuori; });
  $('btnElimina').disabled = fuori;
  // T3: senza rete (o con la sola chiave ADMIN) la struttura si guarda e basta
  $('campiStruttura').disabled = fuori || !io();
  $('btnSezione').disabled = fuori || !io() || !branoSalvato();
  if (ordinatore) ordinatore.option('disabled', fuori || !io());
  // T5: testi e bacheca
  $('btnTesto').disabled = fuori || !io() || !branoSalvato();
  $('btnConferma').disabled = fuori;
  document.querySelectorAll('button.sistemato').forEach((b) => { b.disabled = fuori; });
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
  if (!conosciuto) return vai('vNessuno');
  // T5: mentre si inserisce un testo o si legge, i dati nuovi non portano via dalla schermata
  if (!$('vTesto').hidden || !$('vLettura').hidden) { aggiornaRete(); return; }
  let corrente = memoria.get('vista') || 'vInizio';
  if (corrente === 'vTesto' || corrente === 'vLettura') corrente = 'vBrano';
  if (corrente === 'vAdmin' && !stato.admin) corrente = 'vInizio';
  if (corrente === 'vImpostazioni' && !me) corrente = 'vInizio';
  $('navMetronomo').hidden = !metroAttivo();
  if (corrente === 'vMetronomo' && !metroAttivo()) corrente = 'vInizio';
  if (corrente === 'vBrano') {
    if (schedaOccupata()) { aggiornaRete(); return; }      // si sta scrivendo: non si ridisegna sotto le dita
    const id = memoria.get('branoAperto');
    if (id && brani().some((b) => b.id === id)) { apriBrano(id, true); return; }
    corrente = 'vRepertorio';
  }
  vai(corrente);
}

function vai(vista) {
  if (metro.inCorso() && ((metroDove === 'brano' && !['vBrano', 'vLettura'].includes(vista)) || (metroDove === 'solo' && vista !== 'vMetronomo'))) metro.ferma();
  if (vista === 'vMetronomo') preparaSolo();
  if (vista !== 'vMetronomo') tocchiSolo = [];
  document.querySelectorAll('.vista').forEach((v) => { v.hidden = v.id !== vista; });
  const voce = ['vBrano', 'vTesto', 'vLettura'].includes(vista) ? 'vRepertorio' : vista;
  document.querySelectorAll('#barra button').forEach((b) => b.classList.toggle('attivo', b.dataset.vista === voce));
  $('barra').hidden = vista === 'vNessuno';
  if (vista !== 'vNessuno') memoria.set('vista', vista);
  if (vista === 'vAdmin') caricaMembriAdmin();
  if (vista !== 'vBrano') { tocchiTap = []; }
  aggiornaRete();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#barra button').forEach((b) => b.addEventListener('click', () => vai(b.dataset.vista)));

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
    const r1 = el('div', 'r1'); r1.append(el('b', 'titolo', b.titolo), el('span', 'ton', t.testo));
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
      mostra('esitoBrano', 'Non salvato: ' + (j.campi ? j.campi.map(nomeCampo).join(', ') : j.errore), true);
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
      mostra('esitoStruttura', 'Struttura non salvata: ' + (j.sezioni ? j.sezioni.map((e) => e.campi.map(nomeCampoSezione).join(', ')).join('; ') : j.errore), true);
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
    if (!j.ok) { statoSalva('non salvato', 'errore'); mostra('esitoStruttura', 'Testo non salvato: ' + j.errore, true); return; }
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
    if (!j.ok) { statoSalva('non salvato', 'errore'); return mostra('esitoStruttura', 'Non salvato: ' + j.errore, true); }
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
    if (!j.ok) { statoSalva('non salvato', 'errore'); $('btnConferma').disabled = false; return mostra('esitoControllo', 'Non salvato: ' + j.errore, true); }
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

function disegnaBacheca() {
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
function fermaMetro() { if (metro.inCorso()) metro.ferma(); else { nascondiBarra(); metroDove = null; metroBrano = null; aggiornaPulsantiMetro(); aggiornaPulsanteSolo(); } }
const bpmTesto = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
metro.su('battuta', (a) => {
  const rall = a.tempo < 100 ? ' (' + a.tempo + '%)' : '';
  if (a.conteggio) { $('mNome').textContent = 'Conteggio'; $('mPosizione').textContent = 'batt. ' + a.battuta + '/' + a.battute; }
  else if (a.battute === null) {
    $('mNome').textContent = metroDove === 'solo' ? 'Metronomo' : 'Libero';
    $('mPosizione').textContent = 'batt. ' + a.battuta + ' · ' + bpmTesto(a.bpm) + ' BPM' + rall + ' · ' + a.metro;
  } else {
    // riga 2: battuta e tempo; riga 3 da sola: cosa viene dopo (a 390 px una riga unica veniva tagliata)
    $('mNome').textContent = a.nome;
    $('mPosizione').textContent = 'batt. ' + a.battuta + '/' + a.battute + (a.giri > 1 ? ' · giro ' + a.giro + '/' + a.giri : '') + ' · ' + bpmTesto(a.bpm) + ' BPM' + rall + ' · ' + a.metro;
  }
  if (a.conteggio) $('mPosizione').textContent += ' · ' + bpmTesto(a.bpm) + ' BPM' + rall + ' · ' + a.metro;
  $('mPoi').textContent = a.battute === null ? (metroDove === 'brano' ? metroUltimoMotivo : '') : a.conteggio ? 'poi: ' + (a.prossimo ? a.prossimo.nome : '') : a.prossimo ? 'poi: ' + a.prossimo.nome + ' tra ' + a.prossimo.tra + ' batt.' : 'ultima sezione';
  evidenziaInCorso(a.conteggio ? null : a.sezione);
});
metro.su('colpo', (c) => {
  if (!impostazioni().metronomoLampeggio || c.tipo === 'suddivisione') return;
  const l = $('mLampo');
  l.classList.add('acceso'); l.classList.toggle('uno', c.battito === 1);
  clearTimeout(timerLampo); timerLampo = setTimeout(() => l.classList.remove('acceso', 'uno'), 90);
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
  aggiornaPulsanteSolo();
}
function aggiornaPulsanteSolo() {
  const s = metro.inCorso() && metroDove === 'solo';
  $('btnAvviaM').textContent = s ? '■ Ferma' : '▶ Avvia';
  $('btnAvviaM').classList.toggle('suona', s);
}
function pianoSolo() { return Regole.pianoLibero(solo, opzioniMetro()); }
function bpmSolo(v, daTap) {
  v = Math.round(Number(v));
  if (!(v >= Regole.BPM_MIN && v <= Regole.BPM_MAX)) { $('msBpm').classList.add('invalido'); return; }
  $('msBpm').classList.remove('invalido');
  solo.bpm = v; salvaSolo();
  if (!daTap || document.activeElement !== $('msBpm')) $('msBpm').value = v;
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
function cambioSolo() {
  salvaSolo();
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

/* ---------- Partenza: subito dalla copia sul telefono, poi una chiamata ---------- */
$('versioneMotore').textContent = stato.motore;
disegna();
aggiornaRete();
avvia();

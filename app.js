/* DFAK – Repertorio · comportamento dell'app e chiamate al motore (T2 Repertorio e scheda brano). */
'use strict';

const VERSIONE_INTERFACCIA = 2;   // il motore rifiuta interfacce più vecchie della sua minima
const MOTORE_MINIMO = 2;          // l'app non scrive su motori più vecchi di questo
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
  if (!conosciuto) return vai('vNessuno');
  let corrente = memoria.get('vista') || 'vInizio';
  if (corrente === 'vAdmin' && !stato.admin) corrente = 'vInizio';
  if (corrente === 'vImpostazioni' && !me) corrente = 'vInizio';
  if (corrente === 'vBrano') {
    if (schedaOccupata()) { aggiornaRete(); return; }      // si sta scrivendo: non si ridisegna sotto le dita
    const id = memoria.get('branoAperto');
    if (id && brani().some((b) => b.id === id)) { apriBrano(id, true); return; }
    corrente = 'vRepertorio';
  }
  vai(corrente);
}

function vai(vista) {
  document.querySelectorAll('.vista').forEach((v) => { v.hidden = v.id !== vista; });
  const voce = vista === 'vBrano' ? 'vRepertorio' : vista;
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
  return !$('vBrano').hidden && (!!timerBrano || salvataggioInCorso || (attivo && $('moduloBrano').contains(attivo) && attivo.tagName !== 'BUTTON'));
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
}

function apriBrano(id, daRidisegno) {
  const b = id ? brani().find((x) => x.id === id) : null;
  if (id && !b) return vai('vRepertorio');
  branoAperto = b ? Object.assign({}, b) : { id: nuovoIdBrano(), versione: 0, titolo: '', artista: '', tonalitaOriginale: '', scostamento: 0, accordatura: 'Mib', bpm: '', riferimento: 'Quarti', metro: '4/4', durataManuale: '', note: '', stato: 'In prova' };
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
  $('bDurata').value = Regole.scriviDurata(branoAperto.durataManuale);
  $('bNote').value = branoAperto.note;
  $('rifSuggerito').hidden = true;
  tocchiTap = []; $('tapInfo').textContent = 'Batti a tempo sull\'unità di riferimento (almeno 4 tocchi).';
  document.querySelectorAll('#moduloBrano .invalido').forEach((x) => x.classList.remove('invalido'));
  mostra('esitoBrano', '');
  aggiornaAnteprima();
  disegnaStatiBrano();
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
    riferimento: $('bRiferimento').value, metro: $('bMetro').value,
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
}

const CAMPO_ID = { titolo: 'bTitolo', artista: 'bArtista', tonalitaOriginale: 'bTonalita', scostamento: 'bScost', accordatura: 'bAccordatura', bpm: 'bBpm', riferimento: 'bRiferimento', metro: 'bMetro', durataManuale: 'bDurata', note: 'bNote' };

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
function nomeCampo(c) { return { titolo: 'titolo', tonalitaOriginale: 'tonalità', scostamento: 'scostamento', bpm: 'BPM (30–300, intero)', durataManuale: 'durata (m:ss)', riferimento: 'riferimento', metro: 'metro' }[c] || c; }

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
    if (branoAperto && branoAperto.id === id) {
      Object.assign(branoAperto, { versione: j.brano.versione, modificatoDa: j.brano.modificatoDa, modificatoIl: j.brano.modificatoIl, stato: j.brano.stato });
      $('riquadroElimina').hidden = !stato.admin;
      aggiornaAnteprima();
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
['bTonalita', 'bRiferimento'].forEach((x) => $(x).addEventListener('change', cambioBrano));
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
    salvaCopia(); memoria.del('branoAperto'); branoAperto = null;
    vai('vRepertorio'); disegnaRepertorio();
    mostra('avvisoCodice', '');
    statoSalva('eliminato ✓', 'salvato');
    mostra('repVuoto', '"' + titolo + '" eliminato (resta traccia nello Storico).');
  } catch (e) { mostra('esitoBrano', 'Non eliminato: ' + e.message, true); }
}));

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

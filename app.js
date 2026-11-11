/* DFAK – Repertorio · comportamento dell'app e chiamate al motore (T1 Fondamenta). */
'use strict';

const VERSIONE_INTERFACCIA = 1;   // il motore rifiuta interfacce più vecchie della sua minima
const MOTORE_MINIMO = 1;          // l'app non scrive su motori più vecchi di questo
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
  let risposta;
  try {
    // Corpo come stringa e NESSUNA intestazione aggiunta: Chrome lo manda come testo semplice
    // e non chiede il permesso preventivo che Apps Script non sa dare.
    risposta = await fetch(MOTORE, {
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
  try { j = await risposta.json(); } catch (e) { throw new Error('risposta non valida dal motore (HTTP ' + risposta.status + ')'); }
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
    memoria.set('dati', stato.dati);
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
  const r = stato.dati && stato.dati.risposta;
  const io = r && r.io;
  const conosciuto = !!(codice() || chiaveAdmin());
  $('chiSigla').textContent = io ? io.sigla + ' · ' + io.nome : (chiaveAdmin() ? 'ADMIN' : '');
  $('saluto').textContent = io ? 'Ciao, ' + io.nome : (chiaveAdmin() ? 'Amministrazione' : 'Benvenuto');
  $('ruolo').textContent = io ? io.sigla + ' · ' + io.ruolo : (chiaveAdmin() ? 'Questo telefono ha solo la chiave di amministrazione.' : '');
  $('datiDel').textContent = r ? 'Dati aggiornati al ' + dataOra(stato.dati.quando) : '';
  stato.admin = !!(chiaveAdmin() && (r ? r.admin : true));
  $('navAdmin').hidden = !stato.admin;
  document.querySelector('[data-vista="vImpostazioni"]').hidden = !io && !!chiaveAdmin();
  $('infoTelefono').textContent = io ? 'Qui sei ' + io.sigla + ' (' + io.nome + ') e in più hai la chiave di amministrazione. "Esci" toglie solo la chiave: resti ' + io.sigla + '.'
    : 'Questo telefono ha solo la chiave di amministrazione.';
  if (r && io) disegnaImpostazioni(r.impostazioni);
  if (!conosciuto) return vai('vNessuno');
  const corrente = memoria.get('vista') || 'vInizio';
  vai(corrente === 'vAdmin' && !stato.admin ? 'vInizio' : (corrente === 'vImpostazioni' && !io ? 'vInizio' : corrente));
}

function vai(vista) {
  document.querySelectorAll('.vista').forEach((v) => { v.hidden = v.id !== vista; });
  document.querySelectorAll('#barra button').forEach((b) => b.classList.toggle('attivo', b.dataset.vista === vista));
  $('barra').hidden = vista === 'vNessuno';
  if (vista !== 'vNessuno') memoria.set('vista', vista);
  if (vista === 'vAdmin') caricaMembriAdmin();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#barra button').forEach((b) => b.addEventListener('click', () => vai(b.dataset.vista)));

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
    const dalla = document.createElement('span'); dalla.className = 'dalla'; dalla.textContent = 'attiva dalla ' + d.dalla;
    etichetta.append(dalla);
    riga.append(etichetta);
    let el;
    if (d.tipo === 'si-no') {
      const box = document.createElement('span'); box.className = 'interruttore';
      el = document.createElement('input'); el.type = 'checkbox'; el.checked = !!valori[d.chiave];
      box.append(el, document.createElement('span')); riga.append(box);
    } else if (d.tipo === 'scelta') {
      el = document.createElement('select');
      d.valori.forEach((v) => { const o = document.createElement('option'); o.value = o.textContent = v; el.append(o); });
      el.value = valori[d.chiave]; riga.append(el);
    } else {
      el = document.createElement('input'); el.type = 'range'; el.min = d.min; el.max = d.max; el.step = d.passo; el.value = valori[d.chiave];
      const out = document.createElement('output'); out.textContent = el.value;
      el.addEventListener('input', () => { out.textContent = el.value; });
      riga.append(el, out);
    }
    el.id = 'imp-' + d.chiave; el.name = d.chiave;
    el.addEventListener('change', programmaSalvataggio);
    fs.append(riga);
  });
  modulo.replaceChildren(fs);
  aggiornaRete();
}

function leggiModulo() {
  const v = {};
  Regole.IMPOSTAZIONI.forEach((d) => {
    const el = $('imp-' + d.chiave);
    v[d.chiave] = d.tipo === 'si-no' ? el.checked : (d.tipo === 'numero' ? Number(el.value) : el.value);
  });
  return v;
}

function statoSalva(testo, classe) { const el = $('statoSalva'); el.textContent = testo; el.className = classe || ''; }

let timerSalva = null;
function programmaSalvataggio() {
  clearTimeout(timerSalva);
  if (!puoScrivere()) { statoSalva('serve la rete', 'errore'); disegnaImpostazioni(impostazioniSalvate); return; }
  statoSalva('salvataggio…');
  timerSalva = setTimeout(() => salvaImpostazioni(leggiModulo(), 0), 500);
}

/** Salvataggio in sottofondo con "salvato ✓"; se la rete cade si riprova 2 volte, poi si torna ai valori salvati. */
async function salvaImpostazioni(valori, tentativo) {
  const r = stato.dati.risposta;
  try {
    const j = await chiama('salvaImpostazioni', { impostazioni: valori, versione: r.versioneImpostazioni });
    if (!j.ok) { statoSalva('non salvato', 'errore'); disegnaImpostazioni(impostazioniSalvate); return; }
    r.impostazioni = j.impostazioni; r.versioneImpostazioni = j.versioneImpostazioni;
    impostazioniSalvate = Object.assign({}, j.impostazioni);
    memoria.set('dati', stato.dati);
    statoSalva('salvato ✓', 'salvato');
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
  const io = stato.dati && stato.dati.risposta && stato.dati.risposta.io;
  const ul = $('listaMembri'); ul.textContent = '';
  stato.membriAdmin.forEach((m) => {
    const li = document.createElement('li'); li.dataset.sigla = m.sigla;
    const testa = document.createElement('div'); testa.className = 'nome';
    const b = document.createElement('b'); b.textContent = m.sigla;
    testa.append(b, document.createTextNode(m.nome));
    if ((io && io.sigla === m.sigla) || (m.sigla === 'ADMIN' && chiaveAdmin())) {
      const q = document.createElement('span'); q.className = 'questo'; q.textContent = 'questo telefono'; testa.append(q);
    }
    const data = document.createElement('div'); data.className = 'data'; data.textContent = 'Codice creato il ' + dataOra(m.codiceRigeneratoIl);
    const bCopia = document.createElement('button'); bCopia.textContent = 'Copia link'; bCopia.className = 'secondario';
    bCopia.addEventListener('click', () => copia(linkDi(m.codice), 'esitoAdmin'));
    const bInvia = document.createElement('button'); bInvia.textContent = 'Condividi'; bInvia.className = 'secondario';
    bInvia.hidden = !navigator.share;
    bInvia.addEventListener('click', () => navigator.share({ title: 'Dish for a King – ' + m.sigla, text: 'Il tuo link personale per l\'app della band (' + m.sigla + ' – ' + m.nome + '):', url: linkDi(m.codice) }).catch(() => {}));
    const bRig = document.createElement('button'); bRig.textContent = 'Rigenera'; bRig.className = 'pericolo';
    bRig.addEventListener('click', () => chiediConferma(bRig, () => rigenera(m.sigla)));
    li.append(testa, data, bCopia, bInvia, bRig);
    ul.append(li);
  });
}

/** Conferma con un secondo tocco entro 4 secondi (niente finestre del browser). */
function chiediConferma(bottone, azione) {
  if (bottone.dataset.conferma) { delete bottone.dataset.conferma; bottone.textContent = 'Rigenera'; bottone.className = 'pericolo'; return azione(); }
  bottone.dataset.conferma = '1'; bottone.textContent = 'Tocca di nuovo per confermare'; bottone.className = 'conferma';
  setTimeout(() => { if (bottone.dataset.conferma) { delete bottone.dataset.conferma; bottone.textContent = 'Rigenera'; bottone.className = 'pericolo'; } }, 4000);
}

async function rigenera(sigla) {
  if (!puoScrivere('esitoAdmin')) return;
  try {
    const j = await chiama('rigenera', { sigla });
    if (!j.ok) return mostra('esitoAdmin', 'Non riuscito: ' + j.errore, true);
    const io = stato.dati && stato.dati.risposta && stato.dati.risposta.io;
    let nota = '';
    if (sigla === 'ADMIN') {
      memoria.del('chiaveAdmin'); stato.admin = false;
      nota = '\nLa chiave ADMIN di questo telefono non vale più: l\'amministrazione è stata tolta da qui. Per riaverla apri il nuovo link ADMIN.';
    } else if (io && io.sigla === sigla) {
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
    const el = $('esitoBackup'); el.textContent = 'Fatto ✓ ' + j.backup.nome + ' (copie tenute: ' + j.backup.copieTenute + ')\n';
    const a = document.createElement('a'); a.href = j.backup.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Apri la copia su Drive';
    el.append(a);
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

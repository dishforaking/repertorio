/* DFAK – Repertorio · scheda.js (T8-bis-1 Setup e foglio, progetto approvato il 17/11/2026; T8-bis-2 Collegamento e invio, 18/11/2026)
 * Setup ideali e scheda tecnica della serata: canali, monitor, stage plan, backline, prese, note; foglio A4 stile B.
 * La vedono tutti, la modifica solo l'ADMIN (chiave ADMIN). Si carica DOPO app.js e ne usa le funzioni
 * ($, el, stato, risposta, chiama, puoScrivere, salvaCopia, vai, mostra, memoria, nuovoIdBrano, serataAperta, chiediConferma).
 * Salvataggio: copia di lavoro salvata TUTTA 1,5 s dopo l'ultima modifica (vince l'ultimo, con avviso: modifica solo l'ADMIN).
 */
'use strict';
(function () {
  const R = Regole;
  const NOMI_ICONA = { batteria: 'Batteria', ampliChitarra: 'Ampli chitarra', ampliBasso: 'Ampli basso', pedaliera: 'Pedaliera',
    modeller: 'Modeller', tastiera: 'Tastiera', astaVoce: 'Asta voce', wedge: 'Wedge', centralinaIem: 'Centralina in-ear',
    di: 'DI', presa: 'Presa 230 V', stagebox: 'Stage box S16', rackWing: 'Rack WING', splitter: 'Splitter',
    cassa: 'Cassa', rullante: 'Rullante', tom: 'Tom', timpano: 'Timpano', hihat: 'Hi-hat', ride: 'Ride', crash: 'Crash', splash: 'Splash',
    china: 'China', sgabello: 'Sgabello', pedana: 'Pedana', cassaPa: 'Cassa PA', sub: 'Sub' };
  // Ingombro in cm (larghezza × profondità) usato per disegno e trascinamento.
  const MISURA = { batteria: [180, 150], ampliChitarra: [70, 35], ampliBasso: [65, 45], pedaliera: [70, 30], modeller: [60, 30],
    tastiera: [130, 40], astaVoce: [36, 36], wedge: [60, 45], centralinaIem: [45, 30], di: [24, 18], presa: [30, 30],
    stagebox: [50, 30], rackWing: [55, 50], splitter: [50, 30],
    // variante batteria a pezzi (17/11/2026): misure viste dall'alto
    cassa: [55, 40], rullante: [36, 36], tom: [30, 30], timpano: [40, 40], hihat: [36, 36], ride: [50, 50], crash: [44, 44], splash: [26, 26],
    china: [40, 40], sgabello: [35, 35],
    // T8-bis-2 (D10): casse dell'impianto (nostre in 1B, del locale in 1A)
    cassaPa: [40, 35], sub: [60, 55] };
  const misura = (o) => (o.tipo === 'pedana' ? [o.larghezza * 100, o.profondita * 100] : MISURA[o.tipo] || [30, 30]);
  const NS = 'http://www.w3.org/2000/svg';

  let sk = null;            // copia di lavoro { tipo: 'setup'|'serata', id, proprietario, nome, contenuto, versione, rev, revData, revInviata, setupOrigine }
  let timer = null, inCorso = false, diNuovo = false, scheda = 'canali', canaleAperto = null, iconaScelta = null, ordinatoreCanali = null;
  let trascina = null;
  // Variante zoom (17/11/2026): ingrandimento SOLO nell'editor, non si salva; centro della vista in metri
  const ZOOM = [1, 2, 3, 4];
  let zoom = 1, vista = null, ultimoTocco = null;
  let testoToccato = false;   // T8-bis-2: il messaggio corretto a mano non si riscrive da solo (e non si salva)

  const schedeTutte = () => { const r = risposta(); return (r && r.schede) || []; };
  const indice = () => { const r = risposta(); return (r && r.schedeIndice) || []; };
  const setupTutti = () => schedeTutte().filter((k) => k.tipo === 'setup').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
  const referente = () => { const k = schedeTutte().find((x) => x.tipo === 'referente'); return k ? k.contenuto : { nome: '', telefono: '' }; };
  const puoModificare = () => stato.admin && !senzaRete();
  const copia = (o) => JSON.parse(JSON.stringify(o));
  const idInterno = (p) => p + nuovoIdBrano().slice(1, 10);

  /* ---------- Riquadro "Setup" nella schermata Serate ---------- */
  function disegnaSetup() {
    const box = $('riquadroSetup'); if (!box) return;
    const ul = $('listaSetup'); ul.textContent = '';
    setupTutti().forEach((k) => {
      const li = el('li'); const b = el('button', 'serata'); b.type = 'button';
      const n = R.numeraLinee(k.contenuto.canali).length;
      b.append(el('b', '', k.nome), el('span', 'info', n + ' linee · ' + k.contenuto.monitor.length + ' mix · ' + k.contenuto.palco.icone.length + ' oggetti sul palco'));
      b.addEventListener('click', () => apri({ tipo: 'setup', id: k.id }));
      li.append(b); ul.append(li);
    });
    $('setupVuoti').hidden = !!setupTutti().length;
    $('btnNuovoSetup').hidden = !stato.admin;
    $('btnNuovoSetup').disabled = senzaRete();
    $('btnReferente').hidden = !stato.admin;
    aggiornaSerata();
  }

  /* ---------- Pulsante nella scheda serata ---------- */
  function schedaDellaSerata(id) { return schedeTutte().find((k) => k.tipo === 'serata' && k.proprietario === id) || null; }
  function aggiornaSerata() {
    const b = $('btnSchedaTecnica'); if (!b || typeof serataAperta === 'undefined' || !serataAperta) return;
    const k = schedaDellaSerata(serataAperta.id), inIndice = indice().find((x) => x.tipo === 'serata' && x.proprietario === serataAperta.id);
    const salvata = serateTutte().some((s) => s.id === serataAperta.id);
    b.hidden = !salvata || (!k && !inIndice && !stato.admin);
    b.textContent = k || inIndice ? 'Scheda tecnica · Rev. ' + ((k || inIndice).rev || 1) + ((k || inIndice).revInviata ? ' inviata' : '') : '+ Scheda tecnica';
  }
  async function apriDellaSerata() {
    const id = serataAperta.id, k = schedaDellaSerata(id);
    if (k) return apri({ tipo: 'serata', id: k.id });
    const inIndice = indice().find((x) => x.tipo === 'serata' && x.proprietario === id);
    if (inIndice) {   // serata passata: si carica ora (D2), poi resta sul telefono
      const salvata = memoria.get('scheda-' + inIndice.id);
      if (salvata && salvata.versione === inIndice.versione) return apriOggetto(salvata);
      if (senzaRete()) return mostra('esitoSerata', salvata ? '' : 'Serve la rete per aprire la scheda di una serata passata.', true) || (salvata && apriOggetto(salvata));
      const j = await chiama('leggiScheda', { scheda: inIndice.id });
      if (!j.ok) return mostra('esitoSerata', 'Scheda non trovata.', true);
      memoria.set('scheda-' + j.scheda.id, j.scheda);
      return apriOggetto(j.scheda);
    }
    // ADMIN, serata senza scheda: si sceglie il setup da copiare
    apriOggetto({ tipo: 'serata', id: 'k' + id, proprietario: id, nome: '', contenuto: R.normalizzaScheda({}), versione: 0, rev: 0 });
  }

  /* ---------- Apertura ---------- */
  function apri(rif) {
    const k = schedeTutte().find((x) => x.id === rif.id);
    if (!k) return vai('vSerate');
    apriOggetto(k);
  }
  function apriOggetto(k) {
    sk = copia(k);
    memoria.set('schedaAperta', { id: sk.id, tipo: sk.tipo, proprietario: sk.proprietario });
    canaleAperto = null; iconaScelta = null; zoom = 1; vista = null;
    riempi();
    vai('vScheda');
  }
  // (trovato nel collaudo 17/11) un setup chiamato "Setup Prove…" usciva "Setup Setup Prove…"
  const nomeSetup = (n) => (/^setup\b/i.test(String(n || '').trim()) ? String(n).trim() : 'Setup ' + (n || ''));
  function serataDi(k) { return k && k.tipo === 'serata' ? serateTutte().find((s) => s.id === k.proprietario) || null : null; }
  function titolo() {
    if (sk.tipo === 'setup') return nomeSetup(sk.nome);
    const s = serataDi(sk);
    return 'Scheda tecnica' + (s ? ' · ' + dataSerata(s, true) + (s.locale ? ' · ' + s.locale : '') : '');
  }
  function riempi() {
    $('kTitolo').textContent = titolo();
    $('kIndietro').textContent = sk.tipo === 'setup' ? '◀ Serate' : '◀ Serata';
    const vuota = sk.tipo === 'serata' && !sk.versione;
    $('kCopia').hidden = !(sk.tipo === 'serata' && stato.admin);
    $('kCopiaTesto').textContent = vuota ? 'Questa serata non ha ancora una scheda: scegli il setup da cui partire.' : 'Riparti da un setup (la scheda torna l\'ideale; dopo un invio diventa una nuova revisione).';
    const sel = $('kSetupScelta'); sel.textContent = '';
    setupTutti().forEach((x) => { const o = el('option', '', x.nome); o.value = x.id; if (x.id === sk.setupOrigine) o.selected = true; sel.append(o); });
    $('kBtnCopia').textContent = vuota ? 'Crea dalla scelta' : 'Riparti dal setup';
    $('kBtnCopia').dataset.testo = $('kBtnCopia').textContent;
    $('kNome').value = sk.nome || '';
    $('kNomeRiga').hidden = sk.tipo !== 'setup';
    $('kCorpo').hidden = vuota;
    $('kRev').hidden = sk.tipo !== 'serata' || vuota;
    scriviRev();
    // T8-bis-2: collegamento solo nelle serate; invio per tutti (D11 A)
    $('kTabColl').hidden = sk.tipo !== 'serata';
    if (sk.tipo !== 'serata' && scheda === 'collegamento') scheda = 'canali';
    $('kInvia').hidden = sk.tipo !== 'serata' || vuota;
    $('kBtnEsporta').hidden = !stato.admin || vuota;
    testoToccato = false; $('kInviaTipo').value = '';
    $('kElimina').hidden = !(stato.admin && sk.tipo === 'setup' && sk.versione);
    $('kBtnDuplica').hidden = !(stato.admin && sk.tipo === 'setup' && sk.versione);
    $('kSolaLettura').hidden = stato.admin;
    mostra('esitoK', '');
    mostraScheda(scheda);
    aggiornaAbilitati();
  }
  function aggiornaAbilitati() {
    if ($('vScheda').hidden && !sk) return;
    const no = !puoModificare();
    ['kCampi', 'kCampiMon', 'kCampiAltro', 'kCampiPalco'].forEach((id) => { $(id).disabled = no; });
    $('kNome').disabled = no;
    ['kBtnCopia', 'kBtnElimina', 'kBtnDuplica'].forEach((id) => { $(id).disabled = no; });
    $('kCampiColl').disabled = no;
    $('kBtnInviata').disabled = senzaRete();   // T8-bis-2 (D11 A): lo segna chiunque, serve solo la rete
    if (ordinatoreCanali) ordinatoreCanali.option('disabled', no);
  }
  function mostraScheda(n) {
    scheda = n;
    document.querySelectorAll('#kSchede button').forEach((b) => b.classList.toggle('attivo', b.dataset.k === n));
    document.querySelectorAll('.k-pannello').forEach((p) => { p.hidden = p.dataset.k !== n; });
    if (n === 'canali') disegnaCanali();
    if (n === 'monitor') disegnaMonitor();
    if (n === 'palco') disegnaPalcoEditor();
    if (n === 'altro') riempiAltro();
    if (n === 'collegamento') disegnaCollegamento();
    if (!$('kInvia').hidden) disegnaInvia();
  }
  /** Revisione con chi l'ha segnata inviata e quando (D11 A). */
  function scriviRev() {
    $('kRevTesto').textContent = sk.rev ? R.pieDiPagina({ rev: sk.rev, data: sk.revData }) + (sk.revInviata ? ' · inviata' + (sk.inviataDa ? ' da ' + nomeDi(sk.inviataDa) : '') + (sk.inviataIl ? ' il ' + R.dataBreve(sk.inviataIl) : '') : ' · non ancora inviata') : '';
    $('kBtnInviata').hidden = !!sk.revInviata;
  }
  function nomeDi(sigla) { const m = R.MEMBRI.find((x) => x.sigla === sigla); return m ? m.nome : sigla; }

  /* ---------- Salvataggio ---------- */
  function occupata() {
    const a = document.activeElement;
    return !$('vScheda').hidden && (!!timer || inCorso || !!trascina || !!(a && a.tagName !== 'BUTTON' && $('vScheda').contains(a)));
  }
  function cambio() {
    if (!puoModificare() || !sk) return;
    if (sk.tipo === 'serata' && !sk.versione) return;     // prima si crea dalla scelta del setup
    if (sk.tipo === 'setup' && !String(sk.nome || '').trim()) { $('kNome').classList.add('invalido'); return; }
    $('kNome').classList.remove('invalido');
    clearTimeout(timer);
    mostra('esitoK', 'Modifiche in attesa…');
    timer = setTimeout(salva, 1500);
  }
  async function salva() {
    timer = null;
    if (inCorso) { diNuovo = true; return; }
    if (!puoScrivere('esitoK')) return;
    inCorso = true;
    const inviata = { tipo: sk.tipo, id: sk.id, proprietario: sk.proprietario, nome: sk.nome, contenuto: sk.contenuto };
    try {
      const j = await chiama('salvaScheda', { scheda: inviata, versione: sk.versione || undefined });
      if (!j.ok) { if (j.errore === 'serveAdmin' || j.errore === 'chiaveAdmin') gestisciRifiuto(j); mostra('esitoK', 'Non salvato: ' + j.errore, true); return; }
      ricevi(j.scheda);
      mostra('esitoK', j.avviso ? 'Salvato. Attenzione: nel frattempo l\'aveva modificata ' + j.avviso.modificatoDa + '.' : 'Salvato.');
    } catch (e) {
      mostra('esitoK', 'Non salvato: ' + e.message, true);
    } finally {
      inCorso = false;
      if (diNuovo) { diNuovo = false; salva(); }
    }
  }
  /** Mette la scheda arrivata dal motore nella copia del telefono (avvio, indice) senza toccare ciò che si sta scrivendo. */
  function ricevi(k) {
    const r = risposta(); if (!r) return;
    r.schede = (r.schede || []).filter((x) => x.id !== k.id).concat([k]);
    r.schedeIndice = (r.schedeIndice || []).filter((x) => x.id !== k.id).concat([{ id: k.id, tipo: k.tipo, proprietario: k.proprietario, rev: k.rev, revInviata: k.revInviata, versione: k.versione }]);
    salvaCopia();
    if (sk && sk.id === k.id) {
      sk.versione = k.versione; sk.rev = k.rev; sk.revData = k.revData; sk.revInviata = k.revInviata; sk.setupOrigine = k.setupOrigine;
      sk.inviataDa = k.inviataDa; sk.inviataIl = k.inviataIl;
      $('kRev').hidden = sk.tipo !== 'serata';
      scriviRev();
      if (!$('kInvia').hidden && !testoToccato) disegnaInvia();
      $('kElimina').hidden = !(stato.admin && sk.tipo === 'setup');
      $('kBtnDuplica').hidden = !(stato.admin && sk.tipo === 'setup');
    }
    disegnaSetup();
  }
  async function azione(nome, dati, esito) {
    if (!puoScrivere(esito)) return null;
    try {
      const j = await chiama(nome, dati);
      if (!j.ok) { mostra(esito, 'Non riuscito: ' + j.errore, true); return null; }
      return j;
    } catch (e) { mostra(esito, 'Non riuscito: ' + e.message, true); return null; }
  }

  /* ---------- Canali ---------- */
  function famigliaQuadro(f) {
    const q = el('span', 'fam', R.famigliaDi(f).lettera); q.style.background = R.famigliaDi(f).colore; return q;
  }
  function disegnaCanali() {
    const ul = $('kCanali'); ul.textContent = '';
    const c = sk.contenuto.canali;
    const linee = R.numeraLinee(c);
    c.forEach((x, i) => {
      const li = el('li', 'sezione k-canale' + (canaleAperto === x.id ? ' aperta' : ''));
      li.dataset.id = x.id;
      const testa = el('div', 'riga-sez');
      const man = el('span', 'maniglia', '≡');
      const lin = el('span', 'k-linea', R.etichettaLinee(c, x.id));
      const nome = el('span', 'titolo', x.sorgente || '(senza nome)');
      const det = el('span', 'k-det', dettaglioCanale(x));
      testa.append(man, lin, famigliaQuadro(x.famiglia), nome, det);
      testa.addEventListener('click', (e) => { if (e.target === man) return; canaleAperto = canaleAperto === x.id ? null : x.id; sk.contenuto = R.normalizzaScheda(sk.contenuto); disegnaCanali(); });
      li.append(testa);
      if (canaleAperto === x.id) li.append(editorCanale(x, i));
      ul.append(li);
    });
    const libere = linee.filter((r) => r.libera).map((r) => r.linea);
    $('kLibere').textContent = libere.length ? 'Linee libere (per tenere le coppie stereo su dispari): ' + libere.join(', ') : '';
    $('kTotLinee').textContent = linee.length + ' linee';
    if (ordinatoreCanali) ordinatoreCanali.destroy();
    ordinatoreCanali = Sortable.create(ul, {
      handle: '.maniglia', animation: 150, ghostClass: 'fantasma', draggable: 'li.k-canale', disabled: !puoModificare(),
      onEnd: (e) => {
        if (e.oldIndex === e.newIndex) return;
        const [x] = c.splice(e.oldIndex, 1); c.splice(e.newIndex, 0, x);
        sk.contenuto = R.normalizzaScheda(sk.contenuto);   // l'ordine delle famiglie e il Click in fondo restano
        disegnaCanali(); cambio();
      }
    });
  }
  function dettaglioCanale(y) {
    return [R.testoMic(y.mic), y.phantom ? '48V' : '', y.click ? 'solo monitor' : '', y.fornito === 'locale' ? 'mic locale' : '',
      sk.contenuto.collegamento === '3' && !y.click && !y.split ? 'no split' : ''].filter(Boolean).join(' · ');
  }
  function campo(etichetta, input) { const d = el('label', 'k-campo'); d.append(el('span', 'etichetta', etichetta), input); return d; }
  function scelta(valori, attuale, nomi) {
    const s = el('select');
    valori.forEach((v, i) => { const o = el('option', '', nomi ? nomi[i] : v); o.value = v; if (v === attuale) o.selected = true; s.append(o); });
    return s;
  }
  function editorCanale(x) {
    const box = el('div', 'corpo-sez');
    const t = (v, max, ph) => { const i = el('input'); i.value = v || ''; i.maxLength = max; if (ph) i.placeholder = ph; return i; };
    const sorg = t(x.sorgente, 40, x.stereo ? 'Pan, Basi… (L e R li aggiunge l\'app)' : 'Kick, Vox Lead Ale…'), mic = t(x.mic, 40, 'SM57, DI, modeller, playback'), note = t(x.note, 80);
    const fam = scelta(R.FAMIGLIE.map((f) => f.id), x.famiglia, R.FAMIGLIE.map((f) => f.nome));
    const st = scelta(['mono', 'stereo'], x.stereo ? 'stereo' : 'mono', ['Mono', 'Stereo (L/R)']);
    const asta = scelta(R.ASTE, x.asta);
    const forn = scelta(R.FORNITO, x.fornito, ['Band', 'Locale']);
    const astaDa = scelta(R.FORNITO, x.astaDa, ['Band', 'Locale']);   // C1: chi porta l'asta, a parte dal microfono
    const ph = el('input'); ph.type = 'checkbox'; ph.checked = x.phantom;
    const ck = el('input'); ck.type = 'checkbox'; ck.checked = x.click;
    const sp = el('input'); sp.type = 'checkbox'; sp.checked = x.split; sp.disabled = x.click;   // T8-bis-2 (D5): solo in modalità 3
    // (non ovvio) normalizzaScheda crea oggetti nuovi: il canale si ritrova sempre per id, mai con il riferimento vecchio
    const leggi = () => {
      const y = sk.contenuto.canali.find((z) => z.id === x.id); if (!y) return;
      Object.assign(y, { sorgente: sorg.value, mic: mic.value, note: note.value, famiglia: fam.value, stereo: st.value === 'stereo', asta: asta.value, fornito: forn.value, astaDa: astaDa.value, phantom: ph.checked, click: ck.checked, split: sp.checked });
    };
    // (non ovvio) mentre si scrive NON si ridisegna la lista: passando al campo dopo, il ridisegno toglieva il campo da sotto il dito.
    // Si aggiorna solo la riga in testa; l'ordine per famiglia si rifà quando il riquadro si chiude o cambia una scelta.
    const aggiornaTesta = () => {
      const li = box.closest('li'); if (!li) return;
      const y = sk.contenuto.canali.find((z) => z.id === x.id) || x;
      li.querySelector('.titolo').textContent = y.sorgente || '(senza nome)';
      li.querySelector('.k-det').textContent = dettaglioCanale(y);
    };
    [sorg, mic, note].forEach((i) => i.addEventListener('input', () => { leggi(); aggiornaTesta(); cambio(); }));
    [fam, st, asta, forn, astaDa, ph, ck, sp].forEach((i) => i.addEventListener('change', () => { leggi(); sk.contenuto = R.normalizzaScheda(sk.contenuto); disegnaCanali(); cambio(); }));
    const pc = el('label', 'k-check'); pc.append(ph, document.createTextNode(' 48V'));
    const cc = el('label', 'k-check'); cc.append(ck, document.createTextNode(' Click (solo monitor, mai in PA)'));
    const sc = el('label', 'k-check k-split'); sc.append(sp, document.createTextNode(' Va allo splitter del locale')); sc.hidden = sk.contenuto.collegamento !== '3';
    const elim = el('button', 'secondario', 'Togli canale'); elim.type = 'button';
    elim.addEventListener('click', () => { sk.contenuto.canali = sk.contenuto.canali.filter((y) => y.id !== x.id); canaleAperto = null; disegnaCanali(); cambio(); });
    box.append(campo('Sorgente', sorg), campo('Famiglia', fam), campo('Mono / stereo', st), campo('Mic / DI (si aggiunge "o equivalente")', mic),
      campo('Microfono / DI fornito da', forn), campo('Asta', asta), campo('Asta fornita da', astaDa), pc, cc, sc, campo('Note', note), elim);
    return box;
  }
  function nuovoCanale() {
    sk.contenuto = R.normalizzaScheda(sk.contenuto);
    const x = R.normalizzaCanale({ id: idInterno('c'), sorgente: '', famiglia: 'voci', asta: 'alta' });
    sk.contenuto.canali.push(x);
    sk.contenuto = R.normalizzaScheda(sk.contenuto);
    canaleAperto = x.id; disegnaCanali();
  }

  /* ---------- Monitor ---------- */
  function disegnaMonitor() {
    const ul = $('kMonitor'); ul.textContent = '';
    sk.contenuto.monitor.forEach((m) => {
      const li = el('li', 'k-mix');
      const t = (k, max, ph, cl) => { const i = el('input', cl || ''); i.value = m[k] || ''; i.maxLength = max; i.placeholder = ph; i.addEventListener('input', () => { m[k] = i.value; cambio(); }); return i; };
      const tipo = scelta(R.TIPI_MONITOR, m.tipo); tipo.addEventListener('change', () => { m.tipo = tipo.value; cambio(); });
      const elim = el('button', 'secondario stretto', '✕'); elim.type = 'button'; elim.setAttribute('aria-label', 'Togli mix');
      elim.addEventListener('click', () => { sk.contenuto.monitor = sk.contenuto.monitor.filter((y) => y !== m); disegnaMonitor(); cambio(); });
      const r1 = el('div', 'riga-campi'); r1.append(t('mix', 12, 'MX1', 'corto'), t('chi', 30, 'Chi'), tipo, elim);
      li.append(r1, t('posizione', 30, 'Posizione (es. fronte palco sx)'), t('ascolto', 120, 'In cuffia o in spia: voce, click, basi…'));
      if (String(sk.contenuto.collegamento).indexOf('1A') === 0) {   // T8-bis-2 (D10): il mix va su una spia del locale, via il loro mixer
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = m.sulleSpieLocale;
        cb.addEventListener('change', () => { m.sulleSpieLocale = cb.checked; cambio(); });
        const lab = el('label', 'k-check'); lab.append(cb, document.createTextNode(' Sulle spie del locale (via il loro mixer)'));
        li.append(lab);
      }
      ul.append(li);
    });
  }
  function nuovoMix() {
    const n = sk.contenuto.monitor.length + 1;
    sk.contenuto.monitor.push(R.normalizzaMix({ id: idInterno('m'), mix: 'MX' + n, tipo: 'wedge' }));
    disegnaMonitor(); cambio();
  }

  /* ---------- Altro: backline, prese, orari, note ---------- */
  function riempiAltro() {
    const c = sk.contenuto;
    $('kPorta').value = c.backline.porta; $('kChiede').value = c.backline.chiede; $('kPrese').value = c.prese; $('kNote').value = c.note; $('kOspitalita').value = c.ospitalita;
    $('kCarico').value = c.orari.carico; $('kSound').value = c.orari.soundcheck;
    $('kOrari').hidden = sk.tipo !== 'serata';
  }
  function leggiAltro() {
    const c = sk.contenuto;
    c.backline = { porta: $('kPorta').value, chiede: $('kChiede').value }; c.prese = $('kPrese').value; c.note = $('kNote').value; c.ospitalita = $('kOspitalita').value;
    c.orari = { carico: $('kCarico').value, soundcheck: $('kSound').value };
  }

  /* ---------- Stage plan: disegno (uguale nell'editor e sul foglio) ---------- */
  function s(tag, att, figli) {
    const e = document.createElementNS(NS, tag);
    Object.keys(att || {}).forEach((k) => e.setAttribute(k, att[k]));
    (figli || []).forEach((f) => e.append(f));
    return e;
  }
  const tratto = { fill: '#fff', stroke: '#000', 'stroke-width': 2 };
  function testoSvg(x, y, t, dim, att) { const e = s('text', Object.assign({ x, y, 'font-size': dim, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'system-ui, sans-serif', 'font-weight': 700 }, att || {})); e.textContent = t; return e; }
  /** Figura dell'oggetto centrata in 0,0, in cm. Disegni semplici a tratto: leggibili anche in bianco e nero. */
  function figura(tipo, prese, ped) {
    const [w, h] = tipo === 'pedana' ? [ped ? ped.larghezza * 100 : 120, ped ? ped.profondita * 100 : 90] : MISURA[tipo] || [30, 30], x = -w / 2, y = -h / 2, g = s('g');
    const piatto = (r) => s('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: '#000', 'stroke-width': 1.6, 'stroke-dasharray': '5 3' });
    const box = (a) => s('rect', Object.assign({ x, y, width: w, height: h, rx: 3 }, tratto, a || {}));
    if (tipo === 'pedana') {
      // tratteggio diagonale ritagliato sul rettangolo (id unico: sullo stesso foglio ci sono editor, foglio e legenda)
      const idc = 'cp' + Math.random().toString(36).slice(2, 9);
      const clip = s('clipPath', { id: idc }, [s('rect', { x, y, width: w, height: h })]);
      const hatch = s('g', { stroke: '#bbb', 'stroke-width': 1, 'clip-path': 'url(#' + idc + ')' });
      for (let d = -h; d < w; d += 20) hatch.append(s('line', { x1: x + d, y1: y + h, x2: x + d + h, y2: y }));
      g.append(clip, s('rect', { x, y, width: w, height: h, fill: '#f2f2f2' }), hatch, s('rect', { x, y, width: w, height: h, fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-dasharray': '10 6' }));
    } else if (tipo === 'cassa') {
      g.append(s('rect', Object.assign({ x, y, width: w, height: h, rx: 4 }, tratto, { 'stroke-width': 2.5 })), s('line', { x1: x + 6, x2: x + w - 6, y1: y + h - 6, y2: y + h - 6, stroke: '#000', 'stroke-width': 1.5 }));
    } else if (['rullante', 'tom', 'timpano'].indexOf(tipo) >= 0) {
      g.append(s('circle', Object.assign({ cx: 0, cy: 0, r: w / 2 }, tratto, { 'stroke-width': 2.5 })));
      if (tipo === 'rullante') g.append(s('circle', { cx: 0, cy: 0, r: w / 2 - 5, fill: 'none', stroke: '#000', 'stroke-width': 1 }));
      if (tipo === 'timpano') g.append(s('circle', { cx: 0, cy: 0, r: 3, fill: '#000' }));
    } else if (tipo === 'hihat') {
      g.append(piatto(w / 2), s('circle', Object.assign({ cx: 0, cy: 0, r: w / 2 - 7 }, tratto, { 'stroke-width': 1.2 })), s('circle', { cx: 0, cy: 0, r: 2.5, fill: '#000' }));
    } else if (['ride', 'crash', 'splash', 'china'].indexOf(tipo) >= 0) {
      g.append(piatto(w / 2), s('circle', { cx: 0, cy: 0, r: tipo === 'ride' ? 6 : 3.5, fill: '#000' }));
      if (tipo === 'china') g.append(s('rect', { x: -w / 2 + 6, y: -w / 2 + 6, width: w - 12, height: w - 12, fill: 'none', stroke: '#000', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    } else if (tipo === 'sgabello') {
      g.append(s('circle', { cx: 0, cy: 0, r: w / 2, fill: '#999', stroke: '#000', 'stroke-width': 1.5 }));
    } else if (tipo === 'batteria') {
      g.append(s('circle', Object.assign({ cx: 0, cy: 20, r: 32 }, tratto)), s('circle', Object.assign({ cx: -35, cy: -30, r: 18 }, tratto)), s('circle', Object.assign({ cx: 25, cy: -35, r: 20 }, tratto)),
        s('circle', Object.assign({ cx: 62, cy: 25, r: 26 }, tratto)), s('circle', Object.assign({ cx: -62, cy: 20, r: 17 }, tratto)), s('circle', Object.assign({ cx: -75, cy: -40, r: 15, 'stroke-dasharray': '4 3' }, tratto)),
        s('circle', Object.assign({ cx: 80, cy: -45, r: 20, 'stroke-dasharray': '4 3' }, tratto)), s('circle', Object.assign({ cx: 0, cy: 65, r: 12 }, tratto)));
    } else if (tipo === 'ampliChitarra' || tipo === 'ampliBasso') {
      g.append(box({ 'stroke-width': 3 }));
      for (let i = 1; i < 4; i++) g.append(s('line', { x1: x + 6, x2: x + w - 6, y1: y + i * h / 4, y2: y + i * h / 4, stroke: '#000', 'stroke-width': 1 }));
      g.append(s('rect', { x: x - 1, y: y + h - 6, width: w + 2, height: 6, fill: '#000' }));   // lato pubblico
      if (tipo === 'ampliBasso') g.append(testoSvg(0, 0, 'BASS', 13, { fill: '#000', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }));
    } else if (tipo === 'pedaliera') {
      g.append(box());
      for (let i = 0; i < 4; i++) g.append(s('rect', Object.assign({ x: x + 5 + i * 16, y: y + 5, width: 12, height: h - 10, rx: 2 }, tratto)), s('circle', { cx: x + 11 + i * 16, cy: y + h - 9, r: 2.5, fill: '#000' }));
    } else if (tipo === 'modeller') {
      g.append(box({ 'stroke-width': 3 }), s('rect', { x: x + 8, y: y + 5, width: w - 16, height: 10, fill: '#000' }));
      for (let i = 0; i < 3; i++) g.append(s('circle', Object.assign({ cx: x + 15 + i * 15, cy: y + h - 8, r: 4 }, tratto)));
    } else if (tipo === 'tastiera') {
      g.append(box());
      for (let i = 1; i < 13; i++) g.append(s('line', { x1: x + i * w / 13, x2: x + i * w / 13, y1: y + h * .45, y2: y + h, stroke: '#000', 'stroke-width': 1 }));
      for (let i = 0; i < 13; i++) if ([1, 2, 4, 5, 6, 8, 9, 11, 12].indexOf(i) >= 0) g.append(s('rect', { x: x + i * w / 13 - 3, y: y + h * .45, width: 6, height: h * .3, fill: '#000' }));
    } else if (tipo === 'astaVoce') {
      g.append(s('circle', Object.assign({ cx: 0, cy: 0, r: 16 }, tratto)), s('circle', { cx: 0, cy: 0, r: 6, fill: '#000' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 22, stroke: '#000', 'stroke-width': 3 }));
    } else if (tipo === 'wedge') {
      g.append(s('polygon', Object.assign({ points: [x + 8, y, x + w - 8, y, x + w, y + h, x, y + h].join(' ') }, tratto, { 'stroke-width': 3 })), s('line', { x1: x + 4, x2: x + w - 4, y1: y + h * .6, y2: y + h * .6, stroke: '#000', 'stroke-width': 1.5 }));
    } else if (tipo === 'centralinaIem') {
      g.append(box(), s('line', { x1: x + 6, y1: y, x2: x - 2, y2: y - 14, stroke: '#000', 'stroke-width': 2.5 }), s('line', { x1: x + w - 6, y1: y, x2: x + w + 2, y2: y - 14, stroke: '#000', 'stroke-width': 2.5 }), testoSvg(0, 0, 'IEM', 12));
    } else if (tipo === 'cassaPa') {
      g.append(s('polygon', Object.assign({ points: [x, y, x + w, y, x + w - 5, y + h, x + 5, y + h].join(' ') }, tratto, { 'stroke-width': 3 })),
        s('circle', Object.assign({ cx: 0, cy: 3, r: 10 }, tratto, { 'stroke-width': 1.5 })), s('rect', { x: x - 1, y: y + h - 5, width: w + 2, height: 5, fill: '#000' }), testoSvg(0, -h / 2 + 7, 'PA', 9));
    } else if (tipo === 'sub') {
      g.append(box({ 'stroke-width': 3 }), s('circle', Object.assign({ cx: 0, cy: 0, r: h / 2 - 7 }, tratto, { 'stroke-width': 2 })), s('rect', { x: x - 1, y: y + h - 6, width: w + 2, height: 6, fill: '#000' }), testoSvg(0, 0, 'SUB', 12));
    } else if (tipo === 'presa') {
      g.append(s('circle', Object.assign({ cx: 0, cy: 0, r: 15 }, tratto, { 'stroke-width': 2.5 })), s('circle', { cx: -5, cy: 0, r: 2.6, fill: '#000' }), s('circle', { cx: 5, cy: 0, r: 2.6, fill: '#000' }));
      g.append(testoSvg(17, -15, '×' + (prese || 1), 13, { 'text-anchor': 'start' }));
    } else {
      const sigla = { di: 'DI', stagebox: 'S16', rackWing: 'WING', splitter: 'SPLIT' }[tipo] || '?';
      g.append(box({ 'stroke-width': tipo === 'di' ? 2 : 3 }), testoSvg(0, 0, sigla, tipo === 'di' ? 10 : 12));
    }
    return g;
  }
  /** Disegna il palco in un <svg> (unità = cm). Con editor = true le icone si toccano e si trascinano. */
  function disegnaPalco(svg, palco, editor) {
    svg.textContent = '';
    // C3: margine basso più grande, così "PUBBLICO" sta sotto le scritte degli oggetti sul bordo del palco
    const W = palco.larghezza * 100, H = palco.profondita * 100, M = 34, MB = 70;
    if (editor && zoom > 1) {
      // (non ovvio) stessa proporzione della vista intera: la finestra resta grande uguale sullo schermo, dentro si ingrandisce
      const vw = (W + 2 * M) / zoom, vh = (H + M + MB) / zoom;
      const c = vista || { x: W / 200, y: H / 200 };
      const x0 = Math.min(W + M - vw, Math.max(-M, c.x * 100 - vw / 2)), y0 = Math.min(H + MB - vh, Math.max(-M, c.y * 100 - vh / 2));
      vista = { x: (x0 + vw / 2) / 100, y: (y0 + vh / 2) / 100 };
      svg.setAttribute('viewBox', x0 + ' ' + y0 + ' ' + vw + ' ' + vh);
    } else svg.setAttribute('viewBox', (-M) + ' ' + (-M) + ' ' + (W + 2 * M) + ' ' + (H + M + MB));
    const quad = s('g', { stroke: '#c8c8c8', 'stroke-width': 1 });
    for (let x = 50; x < W; x += 50) quad.append(s('line', { x1: x, x2: x, y1: 0, y2: H, 'stroke-width': x % 100 ? .6 : 1.2 }));
    for (let y = 50; y < H; y += 50) quad.append(s('line', { x1: 0, x2: W, y1: y, y2: y, 'stroke-width': y % 100 ? .6 : 1.2 }));
    svg.append(s('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }), quad, s('rect', { x: 0, y: 0, width: W, height: H, fill: 'none', stroke: '#000', 'stroke-width': 3 }));
    svg.append(testoSvg(W / 2, -M / 2, 'FONDO', 16, { 'letter-spacing': 2 }), testoSvg(W / 2, H + MB - 16, 'PUBBLICO', 18, { 'letter-spacing': 3, class: 'k-pubblico' }));
    svg.append(testoSvg(-M / 2, H / 2, String(palco.profondita).replace('.', ',') + ' m', 13, { transform: 'rotate(-90 ' + (-M / 2) + ' ' + H / 2 + ')' }), testoSvg(W - 30, -M / 2, String(palco.larghezza).replace('.', ',') + ' m', 13));
    palco.icone.forEach((o) => {
      const g = s('g', { transform: 'translate(' + o.x * 100 + ' ' + o.y * 100 + ')', class: 'k-icona' + (editor && iconaScelta === o.id ? ' scelta' : '') });
      g.dataset.id = o.id;
      const f = figura(o.tipo, o.prese, o); f.setAttribute('transform', 'rotate(' + o.rot + ')');
      g.append(f);
      const [w1, h1] = misura(o), pezzo = !!o.gruppo;
      const scritta = o.tipo === 'pedana' ? [o.etichetta || ('Pedana ' + (o.delLocale ? 'del locale' : 'della band')), String(o.larghezza).replace('.', ',') + ' × ' + String(o.profondita).replace('.', ',') + ' m'].join(' · ')
        : [o.etichetta, o.canali].filter(Boolean).join(' · ');
      // C3: posizione della scritta scelta per ogni oggetto (sotto, sopra, a destra, a sinistra)
      const raggio = Math.max(w1, h1) / 2, dove = o.scritta || 'sotto';
      let xs = 0, ys = raggio + 12, anc = 'middle';
      if (o.tipo === 'pedana') ys = h1 / 2 - 10;
      else if (pezzo && dove === 'sotto') ys = 0;
      else if (dove === 'sopra') ys = -raggio - 12;
      else if (dove === 'destra') { xs = raggio + 6; ys = 0; anc = 'start'; }
      else if (dove === 'sinistra') { xs = -raggio - 6; ys = 0; anc = 'end'; }
      if (scritta) g.append(testoSvg(xs, ys, scritta, pezzo ? 10 : 13, { fill: '#000', stroke: '#fff', 'stroke-width': pezzo ? 3 : 4, 'paint-order': 'stroke', 'text-anchor': anc, class: 'k-scritta' }));
      if (editor && iconaScelta === o.id) { const r = Math.max(w1, h1) / 2 + 6; g.insertBefore(o.tipo === 'pedana' ? s('rect', { x: -w1 / 2 - 4, y: -h1 / 2 - 4, width: w1 + 8, height: h1 + 8, fill: 'none', stroke: '#B62E27', 'stroke-width': 3, 'stroke-dasharray': '8 5' }) : s('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: '#B62E27', 'stroke-width': 3, 'stroke-dasharray': '8 5' }), g.firstChild); }
      svg.append(g);
    });
  }

  /* ---------- Stage plan: editor col dito (D4) ---------- */
  function disegnaPalcoEditor() {
    const p = sk.contenuto.palco;
    $('kLargh').value = String(p.larghezza).replace('.', ','); $('kProf').value = String(p.profondita).replace('.', ',');
    disegnaPalco($('kSvg'), p, true);
    disegnaMappa();
    $('kZoomTesto').textContent = zoom + '×';
    $('kZoomMeno').disabled = zoom === 1; $('kZoomTutto').disabled = zoom === 1; $('kZoomPiu').disabled = zoom === ZOOM[ZOOM.length - 1];
    const o = p.icone.find((x) => x.id === iconaScelta);
    $('kIcona').hidden = !o;
    if (o) {
      $('kIcNome').textContent = NOMI_ICONA[o.tipo];
      $('kIcEtichetta').value = o.etichetta; $('kIcCanali').value = o.canali; $('kIcScritta').value = o.scritta || 'sotto';
      $('kIcPreseRiga').hidden = o.tipo !== 'presa'; $('kIcPrese').value = o.prese || 1;
      $('kIcPedana').hidden = o.tipo !== 'pedana';
      if (o.tipo === 'pedana') { $('kPedL').value = String(o.larghezza).replace('.', ','); $('kPedP').value = String(o.profondita).replace('.', ','); $('kPedLocale').checked = o.delLocale; }
      $('kIcGruppoRiga').hidden = !o.gruppo;
      if (!o.gruppo) $('kIcGruppo').checked = false;
    }
    $('kBtnSalvaSet').hidden = !stato.admin || !p.icone.some((x) => x.gruppo === 'batteria');
  }
  function puntoSvg(e) {
    const svg = $('kSvg'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: q.x / 100, y: q.y / 100 };
  }
  /** Pezzi sotto il dito, dal più in alto al più in basso (per scegliere quello sotto con un secondo tocco). */
  function pezziSotto(e) {
    const ids = [];
    document.elementsFromPoint(e.clientX, e.clientY).forEach((el2) => {
      const g = el2.closest && el2.closest('#kSvg .k-icona');
      if (g && ids.indexOf(g.dataset.id) < 0) ids.push(g.dataset.id);
    });
    return ids;
  }
  function scriviPosizione(o) {
    const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
    $('kPos').textContent = o ? (o.etichetta || NOMI_ICONA[o.tipo]) + ' · ' + n(o.x) + ' m da sinistra · ' + n(o.y) + ' m dal fondo' : '';
    $('kPos').hidden = !o;
  }
  function iniziaTrascina(e) {
    const sotto = pezziSotto(e);
    const giaScelto = iconaScelta && sotto.indexOf(iconaScelta) >= 0;
    // (non ovvio) la pedana fa da "fondo": col dito sopra si sposta la vista come su una zona vuota; un tocco fermo la sceglie,
    // e solo quando è scelta si trascina. Altrimenti a zoom alto, con la batteria sulla pedana, non si potrebbe scorrere.
    const soloPedana = sotto.length === 1 && !giaScelto && (sk.contenuto.palco.icone.find((x) => x.id === sotto[0]) || {}).tipo === 'pedana';
    if (!sotto.length || soloPedana) {
      // zona vuota: con lo zoom il dito sposta la vista; un tocco senza movimento toglie la scelta (o sceglie la pedana)
      const p0 = { x: e.clientX, y: e.clientY };
      trascina = { vista: true, id: e.pointerId, p0, c0: vista ? { x: vista.x, y: vista.y } : null, mosso: false, pedana: soloPedana ? sotto[0] : null };
      $('kSvg').setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }
    // (non ovvio) se il pezzo già scelto è sotto il dito si continua con quello: così si trascina anche se un altro gli sta sopra
    iconaScelta = giaScelto ? iconaScelta : sotto[0];
    const o = sk.contenuto.palco.icone.find((x) => x.id === iconaScelta);
    if (!puoModificare()) { trascina = { soloScelta: true, id: e.pointerId, sotto, giaScelto, p0: { x: e.clientX, y: e.clientY } }; disegnaPalcoEditor(); return; }
    const p = puntoSvg(e);
    const gruppo = $('kIcGruppo').checked && o.gruppo ? sk.contenuto.palco.icone.filter((x) => x.gruppo === o.gruppo) : [o];
    trascina = { o, dx: o.x - p.x, dy: o.y - p.y, mosso: false, id: e.pointerId, gruppo, partenza: gruppo.map((x) => ({ x: x.x, y: x.y })), x0: o.x, y0: o.y, sotto, giaScelto, p0: { x: e.clientX, y: e.clientY } };
    $('kSvg').setPointerCapture(e.pointerId);
    e.preventDefault();
    disegnaPalcoEditor();
    scriviPosizione(o);
  }
  function muovi(e) {
    if (!trascina || e.pointerId !== trascina.id || trascina.soloScelta) return;
    if (trascina.vista) {
      if (zoom === 1 || !trascina.c0) return;
      const svg = $('kSvg'), scala = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;   // cm per pixel
      const dx = e.clientX - trascina.p0.x, dy = e.clientY - trascina.p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) trascina.mosso = true;
      vista = { x: trascina.c0.x - dx * scala / 100, y: trascina.c0.y - dy * scala / 100 };
      disegnaPalco(svg, sk.contenuto.palco, true); disegnaMappa();
      return;
    }
    const p = puntoSvg(e), pal = sk.contenuto.palco;
    const passo = trascina.o.gruppo ? R.AGGANCIO_FINE : R.AGGANCIO, tondo = (v) => Math.round(v * 100) / 100;
    const x = tondo(Math.min(pal.larghezza, Math.max(0, Math.round((p.x + trascina.dx) / passo) * passo)));
    const y = tondo(Math.min(pal.profondita, Math.max(0, Math.round((p.y + trascina.dy) / passo) * passo)));
    if (x !== trascina.o.x || y !== trascina.o.y) {
      sposta(trascina.gruppo, trascina.partenza, x - trascina.x0, y - trascina.y0);
      trascina.mosso = true;
      scriviPosizione(trascina.o);
    }
  }
  /** Sposta un gruppo di pezzi della stessa quantità, ognuno tenuto dentro il palco. */
  function sposta(gruppo, partenza, ddx, ddy) {
    const pal = sk.contenuto.palco, tondo = (v) => Math.round(v * 100) / 100;
    gruppo.forEach((q, i) => {
      q.x = tondo(Math.min(pal.larghezza, Math.max(0, partenza[i].x + ddx)));
      q.y = tondo(Math.min(pal.profondita, Math.max(0, partenza[i].y + ddy)));
      const g = $('kSvg').querySelector('.k-icona[data-id="' + q.id + '"]');
      if (g) g.setAttribute('transform', 'translate(' + q.x * 100 + ' ' + q.y * 100 + ')');
    });
    disegnaMappa();
  }
  function fine(e) {
    if (!trascina || e.pointerId !== trascina.id) return;
    const t = trascina; trascina = null;
    if (t.vista) {
      if (!t.mosso && t.pedana) { iconaScelta = t.pedana; scriviPosizione(iconaCorrente()); disegnaPalcoEditor(); }
      else if (!t.mosso && iconaScelta) { iconaScelta = null; scriviPosizione(null); disegnaPalcoEditor(); }
      return;
    }
    const fermo = !t.mosso && Math.abs(e.clientX - t.p0.x) + Math.abs(e.clientY - t.p0.y) < 10;
    // secondo tocco fermo sullo stesso pezzo con altri sotto: si sceglie quello sotto (poi si ricomincia dall'alto)
    if (fermo && t.giaScelto && t.sotto.length > 1) {
      iconaScelta = t.sotto[(t.sotto.indexOf(iconaScelta) + 1) % t.sotto.length];
      disegnaPalcoEditor(); scriviPosizione(iconaCorrente());
      return;
    }
    if (t.mosso) cambio();
  }
  /** Frecce di precisione: un passo (5 cm batteria, 25 cm il resto); con "Sposta tutta la batteria" muovono tutto il gruppo. */
  function freccia(dx, dy) {
    const o = iconaCorrente(); if (!o || !puoModificare()) return;
    const passo = o.gruppo ? R.AGGANCIO_FINE : R.AGGANCIO;
    const gruppo = $('kIcGruppo').checked && o.gruppo ? sk.contenuto.palco.icone.filter((x) => x.gruppo === o.gruppo) : [o];
    sposta(gruppo, gruppo.map((x) => ({ x: x.x, y: x.y })), dx * passo, dy * passo);
    scriviPosizione(o); cambio();
  }
  function cambiaZoom(nuovo) {
    nuovo = Math.min(ZOOM[ZOOM.length - 1], Math.max(1, nuovo));
    const o = iconaCorrente();
    if (nuovo > 1) vista = o ? { x: o.x, y: o.y } : (vista || { x: sk.contenuto.palco.larghezza / 2, y: sk.contenuto.palco.profondita / 2 });
    else vista = null;
    zoom = nuovo; disegnaPalcoEditor();
  }
  /** Riquadrino nell'angolo: tutto il palco, i pezzi come punti e il rettangolo della parte ingrandita. */
  function disegnaMappa() {
    const m = $('kMappa'); if (!m) return;
    // (non ovvio) su un <svg> la proprietà .hidden non esiste: serve l'attributo
    if (zoom === 1) { m.setAttribute('hidden', ''); return; }
    m.removeAttribute('hidden');
    m.textContent = '';
    const pal = sk.contenuto.palco, W = pal.larghezza * 100, H = pal.profondita * 100;
    m.setAttribute('viewBox', '-10 -10 ' + (W + 20) + ' ' + (H + 20));
    m.append(s('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff', stroke: '#000', 'stroke-width': W / 60 }));
    pal.icone.forEach((o) => m.append(s('circle', { cx: o.x * 100, cy: o.y * 100, r: W / 70, fill: o.id === iconaScelta ? '#B62E27' : '#555' })));
    const vb = $('kSvg').viewBox.baseVal;
    m.append(s('rect', { x: vb.x, y: vb.y, width: vb.width, height: vb.height, fill: 'none', stroke: '#B62E27', 'stroke-width': W / 50 }));
  }
  function aggiungiIcona(tipo) {
    const p = sk.contenuto.palco;
    const o = R.normalizzaIcona({ id: idInterno('i'), tipo, x: p.larghezza / 2, y: p.profondita / 2, rot: 0, prese: 1, larghezza: 2, profondita: 2 }, p);
    if (tipo === 'pedana') p.icone.unshift(o); else p.icone.push(o);
    iconaScelta = o.id;
    disegnaPalcoEditor(); cambio();
  }
  /** "Metti il mio set": i pezzi salvati da Francesco (o il set di partenza) attorno al centro del palco. */
  function mettiSet() {
    const p = sk.contenuto.palco, ref = referente();
    const set = ref.mioSet && ref.mioSet.length ? ref.mioSet : R.SET_PARTENZA;
    const cx = p.larghezza / 2, cy = Math.min(p.profondita - 1, Math.max(1, p.profondita * 0.35));
    set.forEach((q) => p.icone.push(R.normalizzaIcona(Object.assign({}, q, { id: idInterno('i'), x: cx + q.x, y: cy + q.y }), p)));
    iconaScelta = null; disegnaPalcoEditor(); cambio();
    mostra('esitoK', (ref.mioSet && ref.mioSet.length ? 'Il tuo set' : 'Set di partenza (destro)') + ': ' + set.length + ' pezzi. Per spostarli tutti insieme scegli un pezzo e accendi "Sposta tutta la batteria".');
  }
  /** "Salva come mio set": posizioni dei pezzi relative al centro del loro ingombro, nella riga del referente. */
  async function salvaSet() {
    const pezzi = sk.contenuto.palco.icone.filter((x) => x.gruppo === 'batteria');
    if (!pezzi.length) return;
    const xs = pezzi.map((q) => q.x), ys = pezzi.map((q) => q.y);
    // centro arrotondato a 5 cm: così le posizioni relative restano sulla griglia dei pezzi e il set rimesso è identico
    const c5 = (v) => Math.round(v / R.AGGANCIO_FINE) * R.AGGANCIO_FINE;
    const cx = c5((Math.min(...xs) + Math.max(...xs)) / 2), cy = c5((Math.min(...ys) + Math.max(...ys)) / 2);
    const ref = referente();
    const mioSet = pezzi.map((q) => ({ tipo: q.tipo, x: Math.round((q.x - cx) * 100) / 100, y: Math.round((q.y - cy) * 100) / 100, rot: q.rot, etichetta: q.etichetta, canali: q.canali }));
    const j = await azione('salvaScheda', { scheda: { tipo: 'referente', contenuto: { nome: ref.nome, telefono: ref.telefono, mioSet } } }, 'esitoK');
    if (j) { ricevi(j.scheda); mostra('esitoK', 'Salvato come tuo set: ' + mioSet.length + ' pezzi. "Metti il mio set" ora li dispone così.'); }
  }
  function iconaCorrente() { return sk.contenuto.palco.icone.find((x) => x.id === iconaScelta); }

  /* ---------- T8-bis-2 · Collegamento (solo serata; modifica solo l'ADMIN) ---------- */
  const locali = () => (window.Locali ? Locali.tutti() : []);
  const numeroCampo = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
  const scriviNum = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  function localeDellaRubrica() { const l = sk.contenuto.locale; return l && l.id ? locali().find((x) => x.id === l.id) || null : null; }
  /** D7: il locale proposto è quello con lo stesso nome scritto nella serata (campo libero della T7). */
  function localeProposto() {
    const s1 = serataDi(sk); if (!s1 || !s1.locale) return null;
    const n = String(s1.locale).trim().toLowerCase();
    return locali().find((x) => String(x.nome).trim().toLowerCase() === n) || null;
  }
  function disegnaCollegamento() {
    const c = sk.contenuto, dl = c.locale;
    const sel = $('kLocScelta'); sel.textContent = '';
    const o0 = el('option', '', locali().length ? '— scegli dalla rubrica —' : 'Rubrica vuota: aggiungi i locali in Serate'); o0.value = ''; sel.append(o0);
    locali().forEach((l) => { const o = el('option', '', l.nome + (l.citta ? ' · ' + l.citta : '')); o.value = l.id; sel.append(o); });
    const prop = localeProposto();
    sel.value = dl && dl.id && locali().some((x) => x.id === dl.id) ? dl.id : (!dl && prop ? prop.id : '');
    $('kLocCopia').textContent = dl ? 'Ricopia' : 'Usa';
    $('kLocProposta').textContent = dl ? 'Dati del locale copiati per questa serata' + (dl.id && !localeDellaRubrica() ? ' (il locale non è più nella rubrica)' : '') + ': se li cambi qui, "Aggiorna il locale" li riporta nella rubrica.'
      : prop ? 'Proposto: ' + prop.nome + ', stesso nome scritto nella serata.' : '';
    $('kLocDati').hidden = !dl;
    $('kLocNuovo').hidden = !!localeDellaRubrica();   // D7: solo se il locale della serata non è già in rubrica
    if (dl) {
      const mx = $('kLocMixer'); mx.textContent = '';
      [{ id: '', nome: '—' }].concat(R.MIXER_LOCALE).forEach((m) => { const o = el('option', '', m.nome); o.value = m.id; mx.append(o); });
      mx.value = dl.mixer;
      $('kLocDistanza').value = scriviNum(dl.distanza); $('kLocPalcoL').value = scriviNum(dl.palcoL); $('kLocPalcoP').value = scriviNum(dl.palcoP);
      $('kLocImpianto').value = dl.impianto; $('kLocSubAux').value = dl.subAux; $('kLocSpie').value = scriviNum(dl.spieCablate); $('kLocCanali').value = scriviNum(dl.canaliLiberi);
      $('kLocImpiantoNote').value = dl.impiantoNote;
      $('kLocAggiorna').hidden = !localeDellaRubrica();
    }
    const mod = $('kModalita'); mod.textContent = '';
    [{ id: '', nome: 'Nessuna (si propone la prima domanda)' }].concat(R.COLLEGAMENTI).forEach((x) => { const o = el('option', '', x.nome); o.value = x.id; mod.append(o); });
    mod.value = c.collegamento;
    aggiornaCollegamento();
  }
  /** Le parti che cambiano mentre si scrive: suggerimento, misure del palco, "Mic da", controlli (senza ricreare i campi). */
  function aggiornaCollegamento() {
    const c = sk.contenuto, dl = c.locale;
    const sug = R.suggerisciModalita(dl || {}), col = R.COLLEGAMENTI.find((x) => x.id === sug.modalita);
    $('kSuggerimento').textContent = !dl ? 'Scegli il locale: la modalità consigliata viene dal suo mixer di sala.'
      : col ? (sug.modalita === c.collegamento ? 'È la modalità consigliata per questo locale.' : 'Consigliata per questo locale: ' + col.nome + '.') + (sug.avviso ? ' ' + sug.avviso : '')
      : sug.primaDomanda ? 'Mixer di sala non noto: manda la prima domanda ("che mixer avete?").' : '';
    const ms = $('kLocMisure');
    ms.hidden = !(dl && dl.palcoL && dl.palcoP && (dl.palcoL !== c.palco.larghezza || dl.palcoP !== c.palco.profondita));
    if (!ms.hidden) ms.textContent = 'Usa le misure del palco del locale (' + scriviNum(dl.palcoL) + ' × ' + scriviNum(dl.palcoP) + ' m)';
    const rf = R.righeFornito(c.canali, c.collegamento);
    $('kFornito').hidden = !rf.diversi;
    if (rf.diversi) {
      $('kFornitoTesto').textContent = (rf.atteso === 'locale' ? 'Con il service del locale di solito microfoni e aste li dà il locale. ' : 'In questa modalità di solito microfoni e aste li porta la band. ') + rf.diversi + (rf.diversi === 1 ? ' riga è segnata "' : ' righe sono segnate "') + (rf.atteso === 'locale' ? 'band' : 'locale') + '".';
      $('kFornitoApplica').textContent = 'Metti "' + (rf.atteso === 'locale' ? 'locale' : 'band') + '" su tutte';
    }
    const ul = $('kControlli'); ul.textContent = '';
    R.controlliScheda(c).forEach((x) => ul.append(el('li', 'k-controllo ' + x.livello, (x.livello === 'info' ? 'ℹ ' : '⚠ ') + x.testo)));
  }
  function leggiLocaleScheda() {
    const dl = sk.contenuto.locale; if (!dl) return;
    Object.assign(dl, { mixer: $('kLocMixer').value, distanza: numeroCampo($('kLocDistanza').value), palcoL: numeroCampo($('kLocPalcoL').value), palcoP: numeroCampo($('kLocPalcoP').value),
      impianto: $('kLocImpianto').value, subAux: $('kLocSubAux').value, spieCablate: numeroCampo($('kLocSpie').value), canaliLiberi: numeroCampo($('kLocCanali').value), impiantoNote: $('kLocImpiantoNote').value });
  }
  /** "Aggiorna il locale" (D7): i dati tecnici della copia tornano nella rubrica; contatti e note restano quelli della rubrica. */
  async function aggiornaLocale() {
    const l = localeDellaRubrica(); if (!l) return;
    sk.contenuto = R.normalizzaScheda(sk.contenuto);
    const dl = sk.contenuto.locale, nuovo = Object.assign({}, l, R.normalizzaDatiLocale(dl), { id: l.id, nome: dl.nome || l.nome, citta: dl.citta || l.citta, contatti: l.contatti, note: l.note });
    const j = await azione('salvaLocale', { locale: nuovo, versione: l.versione }, 'esitoK');
    if (j) { Locali.ricevi(j.locale); mostra('esitoK', 'Locale ' + j.locale.nome + ' aggiornato nella rubrica.'); disegnaCollegamento(); }
  }
  /** "Salva come nuovo locale" (D7): crea la voce in rubrica dai dati della serata. */
  async function nuovoLocale() {
    const s1 = serataDi(sk);
    sk.contenuto = R.normalizzaScheda(sk.contenuto);
    const dl = sk.contenuto.locale || R.normalizzaDatiLocale({});
    const id = nuovoIdBrano(), nome = dl.nome || (s1 && s1.locale) || '';
    if (!nome) return mostra('esitoK', 'Scrivi prima il locale nella serata: serve il nome.', true);
    const j = await azione('salvaLocale', { locale: Object.assign({}, dl, { id, nome, contatti: [] }) }, 'esitoK');
    if (!j) return;
    Locali.ricevi(j.locale);
    sk.contenuto.locale = R.normalizzaDatiLocale(j.locale);
    disegnaCollegamento(); cambio();
    mostra('esitoK', 'Locale ' + j.locale.nome + ' aggiunto alla rubrica: i contatti si scrivono in Serate → Locali.');
  }

  /* ---------- T8-bis-2 · Invio al contatto (tutti, D11 A; D3 B: PDF dalla stampa + WhatsApp col messaggio) ---------- */
  function contattiScheda() { const l = localeDellaRubrica(); return l ? l.contatti : []; }
  function disegnaInvia() {
    const sel = $('kInviaContatto'), prima = sel.value;
    sel.textContent = '';
    const cs = contattiScheda();
    cs.forEach((c, i) => { const o = el('option', '', c.nome + ' (' + c.ruolo + ')' + (c.tiene ? ' · lo tiene ' + c.tiene : '') + (c.telefono ? '' : ' · senza numero')); o.value = String(i); sel.append(o); });
    const o0 = el('option', '', cs.length ? 'Un altro contatto (scegli in WhatsApp)' : 'Nessun contatto in rubrica: scegli in WhatsApp'); o0.value = ''; sel.append(o0);
    const mio = io() && cs.findIndex((c) => c.tiene === io().sigla);
    sel.value = prima !== '' && cs[Number(prima)] ? prima : mio >= 0 ? String(mio) : cs.length ? '0' : '';
    if (!testoToccato) $('kInviaTesto').value = messaggio();
    $('kInviaNota').textContent = 'Dopo l\'invio tocca "Segna come inviata": così la prossima modifica diventa la Rev. ' + ((sk.rev || 1) + 1) + '.';
  }
  function messaggio() {
    const me = io(), ref = referente();
    const mittente = { nome: me ? me.nome : (ref.nome || 'la band'), referente: !!stato.admin };
    return R.messaggioTecnico({ contenuto: R.normalizzaScheda(sk.contenuto), serata: serataDi(sk) || {}, referente: ref, mittente, rev: sk.rev || 1, tipo: $('kInviaTipo').value });
  }
  async function scriviAlContatto() {
    const testo = $('kInviaTesto').value, i = $('kInviaContatto').value, c = i === '' ? null : contattiScheda()[Number(i)];
    const n = c ? R.numeroWa(c.telefono) : '';
    if (n) {
      const a = $('kInviaLink') || document.body.appendChild(Object.assign(el('a'), { id: 'kInviaLink', target: '_blank', rel: 'noopener', hidden: true }));
      a.href = 'https://wa.me/' + n + '?text=' + encodeURIComponent(testo);
      a.click();
      return mostra('esitoK', 'Si apre WhatsApp con ' + c.nome + ': allega il PDF con la graffetta e invia.');
    }
    if (navigator.share) { try { await navigator.share({ text: testo }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(testo); mostra('esitoK', 'Messaggio copiato: incollalo in WhatsApp.'); } catch (e) { mostra('esitoK', 'Copia il messaggio dal riquadro.', true); }
  }
  /** D9: file .json per la Scheda Gig (solo ADMIN). */
  function nomeFileGig(k) {
    const s1 = serataDi(k), pul = (t) => String(t || '').replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    return (s1 ? [s1.data, pul(s1.locale)].filter(Boolean).join(' ') : pul(nomeSetup(k.nome))) + ' - Scheda Gig.json';
  }
  function esporta() {
    const dati = R.esportaSchedaGig(R.normalizzaScheda(sk.contenuto), serataDi(sk) || {});
    const url = URL.createObjectURL(new Blob([JSON.stringify(dati, null, 1)], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = nomeFileGig(sk); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    mostra('esitoK', 'Scaricato "' + a.download + '": aprilo nella Scheda Gig con "Carica".');
  }

  /* ---------- Foglio A4 stile B (pagina 1: palco; pagina 2: canali, monitor, backline, note) ---------- */
  function testaFoglioK(k) {
    const t = el('div', 'testa-f k-testa');
    const img = el('img'); img.src = 'logo/logo-dish-chiaro-scritta.svg'; img.alt = 'Dish for a King';
    const s1 = serataDi(k);
    const tt = el('div', 'tit-f');
    tt.append(el('b', '', 'Scheda tecnica'), el('span', '', s1 ? [dataSerata(s1), s1.locale].filter(Boolean).join(' · ') : nomeSetup(k.nome)));
    t.append(img, tt); return t;
  }
  function piedeK(k, n, tot) {
    const p = el('div', 'k-piede');
    p.append(el('span', '', k.tipo === 'serata' && k.rev ? R.pieDiPagina({ rev: k.rev, data: k.revData }) : nomeSetup(k.nome) + ' · situazione ideale'), el('span', '', 'Pagina ' + n + ' di ' + tot));
    return p;
  }
  function tabella(intest, righe, classe) {
    const t = el('table', 'k-tab ' + (classe || '')); const th = el('tr');
    intest.forEach((h) => th.append(el('th', '', h))); t.append(th);
    righe.forEach((r) => { const tr = el('tr', r.classe || ''); r.celle.forEach((c) => { const td = el('td'); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); }); t.append(tr); });
    return t;
  }
  function costruisciFoglioK(k) {
    const f = $('foglioScheda'); f.textContent = ''; f.style.transform = '';
    const c = k.contenuto, ref = referente(), s1 = serataDi(k);
    // Pagina 1
    const p1 = el('div', 'pagina k-pagina');
    p1.append(testaFoglioK(k));
    const info = el('div', 'k-info');
    const r = el('div', 'k-ref'); r.append(el('b', '', 'Referente tecnico'), el('span', '', [ref.nome, ref.telefono].filter(Boolean).join(' · ') || '—'));
    info.append(r);
    if (s1) {
      const o = el('div', 'k-orari');
      o.append(el('b', '', 'Orari'), el('span', '', [c.orari.carico ? 'carico ' + c.orari.carico : '', c.orari.soundcheck ? 'soundcheck ' + c.orari.soundcheck : '', s1.orario ? 'inizio ' + s1.orario : ''].filter(Boolean).join(' · ') || '—'));
      info.append(o);
    }
    p1.append(info);
    const rc = k.tipo === 'serata' ? R.righeCollegamento(c) : null;   // T8-bis-2 (D5): cosa chiediamo al locale
    if (rc) { const b = el('div', 'k-coll'); b.append(el('b', '', 'Collegamento · ' + rc.titolo)); const ul = el('ul'); rc.righe.forEach((t) => ul.append(el('li', '', t))); b.append(ul); p1.append(b); }
    p1.append(el('h3', '', 'Stage plan'));
    const svg = s('svg', { class: 'k-palco', xmlns: NS }); disegnaPalco(svg, c.palco, false); p1.append(svg);
    // C4: in legenda solo gli oggetti usati; i pezzi della batteria in una voce sola, icone più grandi
    const tipi = []; let batteria = false;
    c.palco.icone.forEach((o) => { if (o.gruppo === 'batteria') batteria = true; else if (tipi.indexOf(o.tipo) < 0) tipi.push(o.tipo); });
    if (tipi.length || batteria) {
      const lg = el('div', 'k-legenda');
      if (batteria) {
        const d = el('span', 'k-leg k-leg-batt');
        const usa = (lista) => c.palco.icone.some((o) => lista.indexOf(o.tipo) >= 0);
        const parti = [], esempi = [];
        if (usa(['cassa', 'rullante', 'tom', 'timpano'])) { parti.push('fusti a tratto pieno'); esempi.push('timpano'); }
        if (usa(['hihat', 'ride', 'crash', 'splash', 'china'])) { parti.push('piatti tratteggiati'); esempi.push('crash'); }
        if (usa(['sgabello'])) { parti.push('sgabello grigio'); esempi.push('sgabello'); }
        esempi.forEach((t) => { const v = s('svg', { viewBox: '-28 -28 56 56', class: 'k-leg-ic' }); v.append(figura(t, 1)); d.append(v); });
        d.append(el('span', '', 'Batteria' + (parti.length ? ': ' + parti.join(', ') : '')));
        lg.append(d);
      }
      tipi.forEach((t) => { const v = s('svg', { viewBox: t === 'pedana' ? '-90 -70 180 140' : '-60 -45 120 90', class: 'k-leg-ic' }); v.append(figura(t, 1, t === 'pedana' ? { larghezza: 1.6, profondita: 1.2 } : null)); const d = el('span', 'k-leg'); d.append(v, el('span', '', NOMI_ICONA[t])); lg.append(d); });
      p1.append(lg);
    }
    const prese = c.palco.icone.filter((o) => o.tipo === 'presa');
    const totPrese = prese.reduce((a, o) => a + (o.prese || 1), 0);
    if (c.prese || totPrese) p1.append(el('h3', '', 'Prese 230 V'), el('p', 'k-testo', [totPrese ? totPrese + (totPrese === 1 ? ' presa' : ' prese') + ' in ' + prese.length + (prese.length === 1 ? ' punto' : ' punti') + ' (vedi stage plan)' : '', c.prese].filter(Boolean).join('. ')));
    // Pagina 2
    const p2 = el('div', 'pagina k-pagina');
    p2.append(testaFoglioK(k), el('h3', '', 'Channel list'));
    const mod = k.tipo === 'serata' ? c.collegamento : '', conSplit = mod === '3';
    const righe = R.numeraLinee(c.canali).map((x) => {
      if (x.libera) return { classe: 'libera', celle: [String(x.linea), 'libera', '', '', '', '', '', ''].concat(conSplit ? [''] : []) };
      const y = x.canale, nome = el('span', 'k-sorg'); nome.append(famigliaQuadro(y.famiglia), document.createTextNode(' ' + R.nomeLinea(y.sorgente, x.lato)));
      const chi = (v) => (v === 'locale' ? 'Locale' : 'Band');
      const celle = [String(x.linea), nome, R.testoMic(y.mic), y.mic ? chi(y.fornito) : '—', y.asta === 'nessuna' ? '—' : y.asta, y.asta === 'nessuna' ? '—' : chi(y.astaDa), y.phantom ? '48V' : ''];
      if (conSplit) celle.push(y.split ? 'sì' : 'no');
      celle.push([y.click ? 'SOLO MONITOR, MAI IN PA' : '', y.note].filter(Boolean).join(' · '));
      return { classe: y.click ? 'click' : '', celle };
    });
    // C1: due colonne separate, "Mic da" e "Asta da"; T8-bis-2: in AES50 la linea è il canale del FOH, nello split la colonna Split
    p2.append(tabella([mod === '2' ? 'Linea = ch FOH' : 'Ch', 'Sorgente', 'Mic / DI', 'Mic da', 'Asta', 'Asta da', '48V'].concat(conSplit ? ['Split'] : []).concat(['Note']), righe, 'k-canali' + (conSplit ? ' k-con-split' : '')));
    const fams = []; c.canali.forEach((y) => { if (fams.indexOf(y.famiglia) < 0) fams.push(y.famiglia); });
    const lf = el('div', 'k-fams'); fams.forEach((fm) => { const d = el('span'); d.append(famigliaQuadro(fm), document.createTextNode(' ' + R.famigliaDi(fm).nome)); lf.append(d); }); p2.append(lf);
    // C2: riepilogo calcolato dalla channel list
    const rp = R.riepilogoScheda(c.canali);
    if (rp.locale.length || rp.band.length) {
      const box = el('div', 'k-riep');
      const blocco = (tit, parti) => { if (!parti.length) return; const d = el('div'); d.append(el('b', '', tit)); parti.forEach((x) => d.append(el('div', '', x.voce + ': ' + x.testo))); box.append(d); };
      blocco('Dal locale ci servono', rp.locale);
      blocco('Porta la band', rp.band);
      if (rp.phantom) box.append(el('div', 'k-riep-48', '48V su ' + rp.phantom + (rp.phantom === 1 ? ' linea' : ' linee')));
      p2.append(box);
    }
    if (c.monitor.length) {
      p2.append(el('h3', '', 'Monitor'));
      // T8-bis-2 (D5): nelle modalità 1-2-3 i monitor sono della band; in 1A si dice per ogni mix dove esce
      if (mod && mod !== '4') p2.append(el('p', 'k-gestiti', 'Gestiti dalla band, dal nostro mixer.'));
      const esce = mod.indexOf('1A') === 0;
      // C7: la colonna "In cuffia o in spia" si nasconde da sola se è vuota su tutte le righe
      const conAscolto = c.monitor.some((m) => m.ascolto);
      p2.append(tabella(['Mix', 'Chi', 'Tipo', 'Posizione'].concat(conAscolto ? ['In cuffia o in spia'] : []).concat(esce ? ['Esce su'] : []),
        c.monitor.map((m) => ({ celle: [m.mix, m.chi, m.tipo, m.posizione].concat(conAscolto ? [m.ascolto] : []).concat(esce ? [m.sulleSpieLocale ? 'Spia del locale (aux del vostro mixer)' : 'Band'] : []) })), 'k-mon'));
    }
    if (c.backline.porta || c.backline.chiede) {
      p2.append(el('h3', '', 'Backline'));
      if (c.backline.porta) p2.append(el('b', 'k-sottotit', 'La band porta'), testoConElenco(c.backline.porta));
      if (c.backline.chiede) p2.append(el('b', 'k-sottotit', 'Chiediamo al locale'), testoConElenco(c.backline.chiede));
    }
    if (c.note) p2.append(el('h3', '', 'Note'), testoConElenco(c.note));
    if (c.ospitalita) p2.append(el('h3', '', 'Ospitalità'), testoConElenco(c.ospitalita));
    p1.append(piedeK(k, 1, 2)); p2.append(piedeK(k, 2, 2));
    f.append(p1, p2);
    scalaAnteprimaK();
  }
  /** C7: paragrafi ed elenchi puntati (righe che iniziano con "-"). */
  function testoConElenco(t) {
    const d = el('div', 'k-testo');
    R.righeTesto(t).forEach((b) => {
      if (b.tipo === 'paragrafo') d.append(el('p', '', b.testo));
      else { const ul = el('ul'); b.voci.forEach((v) => ul.append(el('li', '', v))); d.append(ul); }
    });
    return d;
  }
  function scalaAnteprimaK() {
    const f = $('foglioScheda'), box = $('anteprimaScheda');
    f.style.transform = '';
    const sc = Math.min(1, box.clientWidth / f.offsetWidth);
    f.style.transform = 'scale(' + sc + ')';
    box.style.height = Math.ceil(f.offsetHeight * sc) + 'px';
  }
  function nomeFileK(k) {
    const s1 = serataDi(k);
    const pul = (t) => String(t || '').replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s1) return pul(nomeSetup(k.nome)) + ' - Scheda tecnica Dish for a King';
    return [s1.data, pul(s1.locale)].filter(Boolean).join(' ') + ' - Scheda tecnica Dish for a King';
  }
  function apriFoglio() {
    if (!sk) return;
    vai('vSchedaStampa');
    document.title = nomeFileK(sk);
    costruisciFoglioK(sk);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!$('vSchedaStampa').hidden) costruisciFoglioK(sk); });
  }

  /* ---------- Collegamenti ---------- */
  function collega() {
    $('btnNuovoSetup').addEventListener('click', () => {
      if (!puoScrivere('esitoSerate')) return;
      apriOggetto({ tipo: 'setup', id: nuovoIdBrano(), nome: '', contenuto: R.normalizzaScheda({}), versione: 0 });
      $('kNome').focus();
    });
    $('btnReferente').addEventListener('click', () => {
      const r = referente(); $('refNome').value = r.nome; $('refTel').value = r.telefono;
      $('boxReferente').hidden = !$('boxReferente').hidden;
    });
    $('btnRefSalva').addEventListener('click', async () => {
      const j = await azione('salvaScheda', { scheda: { tipo: 'referente', contenuto: { nome: $('refNome').value, telefono: $('refTel').value } } }, 'esitoSerate');
      if (j) { ricevi(j.scheda); $('boxReferente').hidden = true; mostra('esitoSerate', 'Referente salvato.'); }
    });
    $('btnSchedaTecnica').addEventListener('click', apriDellaSerata);
    $('kIndietro').addEventListener('click', () => {
      if (timer) { clearTimeout(timer); salva(); }
      const k = sk; sk = null; memoria.del('schedaAperta');
      if (k && k.tipo === 'serata' && serateTutte().some((x) => x.id === k.proprietario)) apriSerata(k.proprietario); else vai('vSerate');
    });
    document.querySelectorAll('#kSchede button').forEach((b) => b.addEventListener('click', () => mostraScheda(b.dataset.k)));
    $('kNome').addEventListener('input', () => { sk.nome = $('kNome').value; $('kTitolo').textContent = titolo(); cambio(); });
    $('kAggCanale').addEventListener('click', nuovoCanale);
    $('kAggMix').addEventListener('click', nuovoMix);
    ['kPorta', 'kChiede', 'kPrese', 'kNote', 'kOspitalita', 'kCarico', 'kSound'].forEach((id) => $(id).addEventListener('input', () => { leggiAltro(); cambio(); }));
    ['kCarico', 'kSound'].forEach((id) => $(id).addEventListener('change', () => { sk.contenuto = R.normalizzaScheda(sk.contenuto); riempiAltro(); }));
    const misura = () => {
      const p = sk.contenuto.palco;
      p.larghezza = Number(String($('kLargh').value).replace(',', '.')) || p.larghezza;
      p.profondita = Number(String($('kProf').value).replace(',', '.')) || p.profondita;
      sk.contenuto = R.normalizzaScheda(sk.contenuto); disegnaPalcoEditor(); cambio();
    };
    $('kLargh').addEventListener('change', misura); $('kProf').addEventListener('change', misura);
    const pal = $('kTavolozza');
    const tasto = (t, dove) => {
      const b = el('button', 'secondario k-tav'); b.type = 'button'; b.dataset.tipo = t;
      const v = s('svg', { viewBox: t === 'pedana' ? '-70 -55 140 110' : R.PEZZI_BATTERIA.indexOf(t) >= 0 ? '-40 -32 80 64' : '-100 -80 200 160' });
      v.append(figura(t, 1, t === 'pedana' ? { larghezza: 1.2, profondita: 0.9 } : null));
      b.append(v, el('span', '', NOMI_ICONA[t]));
      b.addEventListener('click', () => aggiungiIcona(t));
      dove.append(b);
    };
    R.ICONE_PALCO.filter((t) => t !== 'batteria' && t !== 'pedana' && R.PEZZI_BATTERIA.indexOf(t) < 0).forEach((t) => tasto(t, pal));
    R.PEZZI_BATTERIA.concat(['pedana']).forEach((t) => tasto(t, $('kTavBatteria')));
    $('kBtnMettiSet').addEventListener('click', mettiSet);
    $('kBtnSalvaSet').addEventListener('click', salvaSet);
    const ped = () => { const o = iconaCorrente(); if (!o || o.tipo !== 'pedana') return;
      o.larghezza = Number(String($('kPedL').value).replace(',', '.')) || o.larghezza; o.profondita = Number(String($('kPedP').value).replace(',', '.')) || o.profondita; o.delLocale = $('kPedLocale').checked;
      sk.contenuto = R.normalizzaScheda(sk.contenuto); disegnaPalcoEditor(); cambio(); };
    ['kPedL', 'kPedP', 'kPedLocale'].forEach((id) => $(id).addEventListener('change', ped));
    const svg = $('kSvg');
    svg.addEventListener('pointerdown', iniziaTrascina);
    svg.addEventListener('pointermove', muovi);
    svg.addEventListener('pointerup', fine); svg.addEventListener('pointercancel', fine);
    $('kIcEtichetta').addEventListener('input', () => { const o = iconaCorrente(); if (o) { o.etichetta = $('kIcEtichetta').value.slice(0, 30); disegnaPalco($('kSvg'), sk.contenuto.palco, true); cambio(); } });
    $('kIcScritta').addEventListener('change', () => { const o = iconaCorrente(); if (o) { o.scritta = $('kIcScritta').value === 'sotto' ? undefined : $('kIcScritta').value; disegnaPalcoEditor(); cambio(); } });
    $('kIcCanali').addEventListener('input', () => { const o = iconaCorrente(); if (o) { o.canali = $('kIcCanali').value.slice(0, 20); disegnaPalco($('kSvg'), sk.contenuto.palco, true); cambio(); } });
    $('kIcPrese').addEventListener('change', () => { const o = iconaCorrente(); if (o) { o.prese = Math.min(12, Math.max(1, Math.round(Number($('kIcPrese').value) || 1))); disegnaPalcoEditor(); cambio(); } });
    const ruota = (d) => { const o = iconaCorrente(); if (o) { o.rot = ((o.rot + d) % 360 + 360) % 360; disegnaPalcoEditor(); cambio(); } };
    $('kZoomPiu').addEventListener('click', () => cambiaZoom(zoom + 1));
    $('kZoomMeno').addEventListener('click', () => cambiaZoom(zoom - 1));
    $('kZoomTutto').addEventListener('click', () => cambiaZoom(1));
    [['kFrSu', 0, -1], ['kFrGiu', 0, 1], ['kFrSx', -1, 0], ['kFrDx', 1, 0]].forEach(([id, dx, dy]) => $(id).addEventListener('click', () => freccia(dx, dy)));
    $('kIcSx').addEventListener('click', () => ruota(-45)); $('kIcDx').addEventListener('click', () => ruota(45));
    $('kIcTogli').addEventListener('click', () => { sk.contenuto.palco.icone = sk.contenuto.palco.icone.filter((x) => x.id !== iconaScelta); iconaScelta = null; disegnaPalcoEditor(); cambio(); });
    $('kBtnFoglio').addEventListener('click', apriFoglio);
    $('kStampaIndietro').addEventListener('click', () => { vai('vScheda'); });
    $('kStampa').addEventListener('click', () => { if (sk) document.title = nomeFileK(sk); window.print(); });
    window.addEventListener('resize', () => { if (!$('vSchedaStampa').hidden) scalaAnteprimaK(); });
    $('kBtnCopia').addEventListener('click', () => {
      const setup = $('kSetupScelta').value;
      if (!setup) return mostra('esitoK', 'Prima crea un setup (Serate → Setup).', true);
      const fai = async () => {
        const j = await azione('copiaSetup', { serata: sk.proprietario, setup }, 'esitoK');
        if (j) { ricevi(j.scheda); apriOggetto(j.scheda); mostra('esitoK', 'Scheda copiata dal setup ' + (j.scheda.nome || '') + '.'); }
      };
      if (!sk.versione) fai(); else chiediConferma($('kBtnCopia'), fai);
    });
    $('kBtnInviata').addEventListener('click', async () => {
      if (timer && puoModificare()) { clearTimeout(timer); await salva(); }
      const j = await azione('segnaInviata', { scheda: sk.id }, 'esitoK');
      if (j) { ricevi(j.scheda); mostra('esitoK', 'Rev. ' + j.scheda.rev + ' segnata come inviata: la prossima modifica sarà la Rev. ' + (j.scheda.rev + 1) + '.'); }
    });
    // T8-bis-2: collegamento, invio, esportazione
    $('kLocCopia').addEventListener('click', () => {
      const l = locali().find((x) => x.id === $('kLocScelta').value);
      if (!l) return mostra('esitoK', 'Scegli un locale dalla rubrica (o creane uno in Serate → Locali).', true);
      sk.contenuto.locale = R.normalizzaDatiLocale(l);
      disegnaCollegamento(); cambio(); if (!$('kInvia').hidden) disegnaInvia();
    });
    ['kLocDistanza', 'kLocPalcoL', 'kLocPalcoP', 'kLocSpie', 'kLocCanali', 'kLocImpiantoNote'].forEach((id) => $(id).addEventListener('input', () => { leggiLocaleScheda(); aggiornaCollegamento(); cambio(); }));
    ['kLocMixer', 'kLocImpianto', 'kLocSubAux'].forEach((id) => $(id).addEventListener('change', () => { leggiLocaleScheda(); aggiornaCollegamento(); cambio(); }));
    ['kLocDistanza', 'kLocPalcoL', 'kLocPalcoP', 'kLocSpie', 'kLocCanali'].forEach((id) => $(id).addEventListener('change', () => { sk.contenuto = R.normalizzaScheda(sk.contenuto); disegnaCollegamento(); }));
    $('kLocAggiorna').addEventListener('click', aggiornaLocale);
    $('kLocNuovo').addEventListener('click', nuovoLocale);
    $('kLocMisure').addEventListener('click', () => {
      const dl = sk.contenuto.locale; if (!dl) return;
      sk.contenuto.palco.larghezza = dl.palcoL; sk.contenuto.palco.profondita = dl.palcoP;
      sk.contenuto = R.normalizzaScheda(sk.contenuto); aggiornaCollegamento(); cambio();
      mostra('esitoK', 'Palco ' + scriviNum(dl.palcoL) + ' × ' + scriviNum(dl.palcoP) + ' m: controlla nello stage plan che gli oggetti siano ancora al loro posto.');
    });
    $('kModalita').addEventListener('change', () => { sk.contenuto.collegamento = $('kModalita').value; aggiornaCollegamento(); cambio(); if (!$('kInvia').hidden && !testoToccato) disegnaInvia(); });
    $('kFornitoApplica').addEventListener('click', () => {
      sk.contenuto.canali = R.applicaFornito(sk.contenuto.canali, sk.contenuto.collegamento);
      sk.contenuto = R.normalizzaScheda(sk.contenuto); aggiornaCollegamento(); cambio();
    });
    $('kInviaPdf').addEventListener('click', apriFoglio);
    $('kInviaContatto').addEventListener('change', () => { if (!testoToccato) $('kInviaTesto').value = messaggio(); });
    $('kInviaTipo').addEventListener('change', () => { testoToccato = false; $('kInviaTesto').value = messaggio(); });
    $('kInviaTesto').addEventListener('input', () => { testoToccato = true; });
    $('kInviaScrivi').addEventListener('click', scriviAlContatto);
    $('kBtnEsporta').addEventListener('click', esporta);
    $('kBtnDuplica').addEventListener('click', () => {
      const nuovo = { tipo: 'setup', id: nuovoIdBrano(), nome: (sk.nome + ' copia').slice(0, 30), contenuto: copia(sk.contenuto), versione: 0 };
      apriOggetto(nuovo); cambio();
    });
    $('kBtnElimina').addEventListener('click', () => chiediConferma($('kBtnElimina'), async () => {
      const j = await azione('eliminaScheda', { scheda: sk.id }, 'esitoK');
      if (j) {
        const r = risposta(); r.schede = r.schede.filter((x) => x.id !== sk.id); r.schedeIndice = (r.schedeIndice || []).filter((x) => x.id !== sk.id);
        salvaCopia(); sk = null; memoria.del('schedaAperta'); disegnaSetup(); vai('vSerate');
      }
    }));
  }

  /* ---------- Ridisegno quando arrivano dati nuovi (chiamato da disegna() in app.js) ---------- */
  function ridisegna() {
    disegnaSetup();
    if ($('vScheda').hidden || !sk || occupata()) { aggiornaAbilitati(); return; }
    const k = schedeTutte().find((x) => x.id === sk.id);
    if (k && k.versione !== sk.versione) { sk = copia(k); riempi(); }
  }
  /** Al riavvio dell'app: riapre la scheda che era aperta (vista salvata "vScheda" o "vSchedaStampa"). */
  function riapri() {
    const m = memoria.get('schedaAperta');
    if (!m) return false;
    const k = schedeTutte().find((x) => x.id === m.id) || memoria.get('scheda-' + m.id);
    if (!k) { memoria.del('schedaAperta'); return false; }
    apriOggetto(k); return true;
  }

  collega();
  window.Scheda = { disegnaSetup, aggiornaSerata, ridisegna, riapri, occupata, aggiornaAbilitati, apriOggetto, costruisciFoglioK, nomeFileK, figura, NOMI_ICONA,
    _stato: () => sk };
  disegnaSetup();
  if (['vScheda', 'vSchedaStampa'].indexOf(memoria.get('vista')) >= 0) disegna();   // riapertura dell'app sulla scheda
})();

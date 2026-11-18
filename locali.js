/* DFAK – Repertorio · locali.js (T8-bis-2 Locali e collegamento, progetto approvato il 18/11/2026)
 * Rubrica dei locali: la scrivono tutti (D11 A), la elimina solo l'ADMIN. Ogni locale ha fino a 3 contatti,
 * ognuno con il membro che lo tiene (D1). Si carica dopo app.js e scheda.js e ne usa le funzioni
 * ($, el, stato, risposta, chiama, puoScrivere, salvaCopia, vai, mostra, memoria, nuovoIdBrano, chiediConferma, senzaRete).
 * Salvataggio: copia di lavoro salvata TUTTA 1,5 s dopo l'ultima modifica (vince l'ultimo, con avviso).
 */
'use strict';
(function () {
  const R = Regole;
  const NOMI_RUOLO = { tecnico: 'Tecnico', gestore: 'Gestore', altro: 'Altro' };
  let lc = null;            // copia di lavoro del locale aperto (con versione, 0 = nuovo)
  let timer = null, inCorso = false, diNuovo = false;

  const tutti = () => { const r = risposta(); return ((r && r.locali) || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it')); };
  const nomeMixer = (id) => { const m = R.MIXER_LOCALE.find((x) => x.id === id); return m ? m.nome : ''; };
  const numero = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
  const scrivi = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

  /* ---------- Lista nel riquadro Setup di Serate ---------- */
  function disegnaLista() {
    const ul = $('listaLocali'); if (!ul) return;
    ul.textContent = '';
    tutti().forEach((l) => {
      const li = el('li'); const b = el('button', 'serata'); b.type = 'button';
      const chi = l.contatti.map((c) => c.nome + (c.tiene ? ' (' + c.tiene + ')' : '')).join(', ');
      b.append(el('b', '', l.nome + (l.citta ? ' · ' + l.citta : '')), el('span', 'info', [nomeMixer(l.mixer), chi].filter(Boolean).join(' · ') || 'nessun dato'));
      b.addEventListener('click', () => apri(l.id));
      li.append(b); ul.append(li);
    });
    $('localiVuoti').hidden = !!tutti().length;
    $('btnNuovoLocale').disabled = senzaRete();
  }

  /* ---------- Apertura ---------- */
  function apri(id) {
    const l = tutti().find((x) => x.id === id);
    if (!l) return vai('vSerate');
    apriOggetto(JSON.parse(JSON.stringify(l)));
  }
  function apriOggetto(l) {
    lc = l;
    memoria.set('localeAperto', lc.id);
    riempi();
    vai('vLocale');
  }
  function riempi() {
    $('lTitolo').textContent = lc.nome || 'Locale nuovo';
    $('lNome').value = lc.nome; $('lCitta').value = lc.citta;
    const sel = $('lMixer'); sel.textContent = '';
    [{ id: '', nome: '—' }].concat(R.MIXER_LOCALE).forEach((m) => { const o = el('option', '', m.nome); o.value = m.id; sel.append(o); });
    sel.value = lc.mixer;
    $('lDistanza').value = scrivi(lc.distanza); $('lPalcoL').value = scrivi(lc.palcoL); $('lPalcoP').value = scrivi(lc.palcoP);
    $('lImpianto').value = lc.impianto; $('lImpiantoNote').value = lc.impiantoNote; $('lSubAux').value = lc.subAux;
    $('lSpie').value = scrivi(lc.spieCablate); $('lCanali').value = scrivi(lc.canaliLiberi); $('lNote').value = lc.note;
    disegnaContatti();
    suggerimento();
    $('lElimina').hidden = !(stato.admin && lc.versione);
    mostra('esitoL', '');
    aggiornaAbilitati();
  }
  function aggiornaAbilitati() {
    if (!lc) return;
    const no = senzaRete();
    $('lCampi').disabled = no;
    $('lSenzaRete').hidden = !no;
    $('lBtnElimina').disabled = no;
    $('lAggContatto').hidden = lc.contatti.length >= 3;
  }
  function suggerimento() {
    const s = R.suggerisciModalita(lc);
    const col = R.COLLEGAMENTI.find((x) => x.id === s.modalita);
    $('lSuggerimento').textContent = col ? 'Consigliata: ' + col.nome + (s.avviso ? '. ' + s.avviso : '') : (s.primaDomanda && lc.mixer === 'nonSo' ? 'Mixer non noto: nella serata si propone il messaggio "che mixer avete?".' : '');
  }

  /* ---------- Contatti (fino a 3, ognuno con chi lo tiene) ---------- */
  function disegnaContatti() {
    const ul = $('lContatti'); ul.textContent = '';
    lc.contatti.forEach((c, i) => {
      const li = el('li', 'l-contatto');
      const t = (k, max, ph, tipo) => { const x = el('input'); x.value = c[k] || ''; x.maxLength = max; x.placeholder = ph; if (tipo) x.inputMode = tipo; x.addEventListener('input', () => { c[k] = x.value; cambio(); }); return x; };
      const ruolo = el('select'); R.RUOLI_CONTATTO.forEach((r) => { const o = el('option', '', NOMI_RUOLO[r]); o.value = r; ruolo.append(o); }); ruolo.value = c.ruolo;
      ruolo.addEventListener('change', () => { c.ruolo = ruolo.value; cambio(); });
      const tiene = el('select'); [{ sigla: '', nome: 'Lo tiene: —' }].concat(R.MEMBRI).forEach((m) => { const o = el('option', '', m.sigla ? 'Lo tiene: ' + m.sigla + ' · ' + m.nome : m.nome); o.value = m.sigla; tiene.append(o); });
      tiene.value = c.tiene;
      tiene.addEventListener('change', () => { c.tiene = tiene.value; cambio(); });
      const via = el('button', 'secondario stretto', '✕'); via.type = 'button'; via.setAttribute('aria-label', 'Togli contatto');
      via.addEventListener('click', () => { lc.contatti.splice(i, 1); disegnaContatti(); aggiornaAbilitati(); cambio(); });
      const r1 = el('div', 'riga-campi'); r1.append(t('nome', 40, 'Nome'), ruolo, via);
      const r2 = el('div', 'riga-campi'); r2.append(t('telefono', 20, 'Telefono (+39 …)', 'tel'), tiene);
      li.append(r1, r2); ul.append(li);
    });
  }

  /* ---------- Salvataggio ---------- */
  function leggi() {
    Object.assign(lc, { nome: $('lNome').value, citta: $('lCitta').value, mixer: $('lMixer').value, distanza: numero($('lDistanza').value),
      palcoL: numero($('lPalcoL').value), palcoP: numero($('lPalcoP').value), impianto: $('lImpianto').value, impiantoNote: $('lImpiantoNote').value,
      subAux: $('lSubAux').value, spieCablate: numero($('lSpie').value), canaliLiberi: numero($('lCanali').value), note: $('lNote').value });
    $('lTitolo').textContent = lc.nome || 'Locale nuovo';
    suggerimento();
  }
  function occupata() {
    const a = document.activeElement;
    return !$('vLocale').hidden && (!!timer || inCorso || !!(a && a.tagName !== 'BUTTON' && $('vLocale').contains(a)));
  }
  function cambio() {
    if (!lc || senzaRete()) return;
    if (!String(lc.nome || '').trim()) { $('lNome').classList.add('invalido'); mostra('esitoL', 'Scrivi il nome del locale per salvarlo.'); return; }
    $('lNome').classList.remove('invalido');
    clearTimeout(timer);
    mostra('esitoL', 'Modifiche in attesa…');
    timer = setTimeout(salva, 1500);
  }
  async function salva() {
    timer = null;
    if (inCorso) { diNuovo = true; return; }
    if (!puoScrivere('esitoL')) return;
    inCorso = true;
    try {
      const j = await chiama('salvaLocale', { locale: lc, versione: lc.versione || undefined });
      if (!j.ok) { mostra('esitoL', 'Non salvato: ' + j.errore, true); return; }
      ricevi(j.locale);
      mostra('esitoL', j.avviso ? 'Salvato. Attenzione: nel frattempo l\'aveva modificato ' + j.avviso.modificatoDa + '.' : 'Salvato.');
    } catch (e) {
      mostra('esitoL', 'Non salvato: ' + e.message, true);
    } finally {
      inCorso = false;
      if (diNuovo) { diNuovo = false; salva(); }
    }
  }
  /** Mette il locale arrivato dal motore nella copia del telefono (usato anche dalla scheda per "Salva come nuovo locale"). */
  function ricevi(l) {
    const r = risposta(); if (!r) return;
    r.locali = (r.locali || []).filter((x) => x.id !== l.id).concat([l]);
    salvaCopia();
    if (lc && lc.id === l.id) { lc.versione = l.versione; $('lElimina').hidden = !stato.admin; }
    disegnaLista();
  }

  /* ---------- Collegamenti ---------- */
  function collega() {
    $('btnNuovoLocale').addEventListener('click', () => {
      if (!puoScrivere('esitoSerate')) return;
      apriOggetto(Object.assign(R.normalizzaLocale({}), { id: nuovoIdBrano(), versione: 0 }));
      $('lNome').focus();
    });
    $('lIndietro').addEventListener('click', () => {
      if (timer) { clearTimeout(timer); salva(); }
      lc = null; memoria.del('localeAperto'); vai('vSerate');
    });
    ['lNome', 'lCitta', 'lDistanza', 'lPalcoL', 'lPalcoP', 'lImpiantoNote', 'lSpie', 'lCanali', 'lNote'].forEach((id) => $(id).addEventListener('input', () => { leggi(); cambio(); }));
    ['lMixer', 'lImpianto', 'lSubAux'].forEach((id) => $(id).addEventListener('change', () => { leggi(); cambio(); }));
    $('lAggContatto').addEventListener('click', () => {
      if (lc.contatti.length >= 3) return;
      lc.contatti.push({ nome: '', ruolo: 'tecnico', telefono: '', tiene: (io() && io().sigla) || '' });
      disegnaContatti(); aggiornaAbilitati();
      const ultimi = $('lContatti').querySelectorAll('input'); if (ultimi.length) ultimi[ultimi.length - 2].focus();
    });
    $('lBtnElimina').addEventListener('click', () => chiediConferma($('lBtnElimina'), async () => {
      if (!puoScrivere('esitoL')) return;
      const j = await chiama('eliminaLocale', { locale: lc.id }).catch((e) => ({ ok: false, errore: e.message }));
      if (!j.ok) return mostra('esitoL', 'Non eliminato: ' + j.errore, true);
      const r = risposta(); r.locali = (r.locali || []).filter((x) => x.id !== lc.id);
      salvaCopia(); lc = null; memoria.del('localeAperto'); disegnaLista(); vai('vSerate');
      mostra('esitoSerate', 'Locale eliminato (resta traccia nello Storico).');
    }));
  }

  /* ---------- Ridisegno quando arrivano dati nuovi ---------- */
  function ridisegna() {
    disegnaLista();
    if ($('vLocale').hidden || !lc) return;
    if (occupata()) { aggiornaAbilitati(); return; }
    const l = tutti().find((x) => x.id === lc.id);
    if (l && l.versione !== lc.versione) { lc = JSON.parse(JSON.stringify(l)); riempi(); } else aggiornaAbilitati();
  }
  /** Al riavvio dell'app sulla vista del locale. */
  function riapri() {
    const id = memoria.get('localeAperto');
    if (!id || !tutti().some((x) => x.id === id)) { memoria.del('localeAperto'); return false; }
    apri(id); return true;
  }

  collega();
  window.Locali = { tutti, disegnaLista, ridisegna, riapri, occupata, ricevi, nomeMixer, _stato: () => lc };
  disegnaLista();
  if (memoria.get('vista') === 'vLocale') disegna();
})();

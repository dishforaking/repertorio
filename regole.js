/**
 * DFAK – Regole condivise tra telefono (regole.js su GitHub) e motore (Regole.gs in Apps Script).
 * I DUE FILE DEVONO ESSERE IDENTICI BYTE PER BYTE: il banco di prova lo controlla a ogni consegna.
 * T1: membri, codici, impostazioni personali.
 * T2: tonalità (forme, scostamento, suono reale, notazione), accordature, controlli del brano,
 *     durata manuale, tap tempo, stati di studio, filtri.
 * T3: struttura a sezioni (tipi, nomi numerati, chi suona, cambi per sezione), durata calcolata,
 *     metro 2/2 e riferimento Minime, feel Dritto / Shuffle.
 * T5: testi (pulizia, righe di accordi, etichette, blocchi ripetuti e quasi uguali, struttura proposta,
 *     abbinamento alle sezioni), impostazione "Testi nelle sezioni", avvisi della bacheca.
 * T6: metronomo (colpi di una battuta con ottavi, shuffle e accento; piano che segue la struttura o libero;
 *     rallentamento; durata del piano).
 * T7: serate e scaletta (righe brano / pausa / bis / libera, set e orari, riga del foglio stampato).
 * T8: Modalità Palco (piano del palco dal piano del metronomo, sezione al tempo, "poi:" per almeno 2 s) e file per la serata.
 *     Correzione del collaudo T8 (v8): il foglio trasforma "4/4" in una data; metroLetto lo riporta a "4/4".
 * T8-sync (v9): palco sincronizzato. Messaggio della batteria (start, pronto, fermo, diretta, fine), controllo dei
 *     messaggi ricevuti e vista calcolata da ogni telefono con il proprio orologio (corretto sul server).
 * T8-bis-1 (v11, correzioni del collaudo 17/11): aste nuove, asta da, riepilogo, nome stereo, note a elenco, ospitalità, posizione delle scritte.
 * T8-bis-1 (v10): scheda tecnica (famiglie, linee e coppie stereo, Click ultimo, monitor, stage plan, revisioni).
 */
var Regole = (function () {
  var VERSIONE_REGOLE = 13;
  var TAPPA = 8;   // le impostazioni con "dalla" successiva mostrano l'etichetta "attiva dalla Tx"

  /* Membri: sigle da mixer fisse. ADMIN non è un membro: non vota e non conta nei 5 sì. */
  var MEMBRI = [
    { sigla: 'VOX', nome: 'Ale', ruolo: 'Voce' },
    { sigla: 'GTR1', nome: 'Paolo', ruolo: 'Chitarra 1' },
    { sigla: 'GTR2', nome: 'Ste', ruolo: 'Chitarra 2' },
    { sigla: 'BASS', nome: 'Jack', ruolo: 'Basso' },
    { sigla: 'DRUM', nome: 'Chicco', ruolo: 'Batteria' }
  ];
  var ADMIN = { sigla: 'ADMIN', nome: 'Amministrazione', ruolo: 'Amministrazione' };
  var SIGLE = MEMBRI.map(function (m) { return m.sigla; });

  /* Codici personali: 24 caratteri, senza caratteri che si confondono (0/O, 1/l/I). */
  var ALFABETO_CODICE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var LUNGHEZZA_CODICE = 24;
  function formatoCodiceValido(k) {
    if (typeof k !== 'string' || k.length !== LUNGHEZZA_CODICE) return false;
    for (var i = 0; i < k.length; i++) if (ALFABETO_CODICE.indexOf(k.charAt(i)) < 0) return false;
    return true;
  }
  /** Trasforma 24+ numeri casuali (0–255, anche negativi come i byte di Apps Script) in un codice. */
  function codiceDaByte(byte) {
    var s = '';
    for (var i = 0; i < LUNGHEZZA_CODICE; i++) s += ALFABETO_CODICE.charAt(((byte[i] % 256) + 256) % 256 % ALFABETO_CODICE.length);
    return s;
  }

  /* Impostazioni personali. "dalla" = tappa da cui l'impostazione ha effetto. */
  var IMPOSTAZIONI = [
    { chiave: 'notazione', etichetta: 'Notazione delle tonalità', tipo: 'scelta', valori: ['Do Re Mi', 'C D E', 'Entrambe'], predefinito: 'Do Re Mi', dalla: 'T2' },
    { chiave: 'mostraSuonoReale', etichetta: 'Mostra anche il suono reale (accordatura Mib)', tipo: 'si-no', predefinito: false, dalla: 'T2' },
    { chiave: 'battute', etichetta: 'Mostra le battute nelle sezioni', tipo: 'si-no', predefinito: true, dalla: 'T3' },
    { chiave: 'evidenziaSoloMe', etichetta: 'Evidenzia solo la mia parte', tipo: 'si-no', predefinito: false, dalla: 'T3' },
    // T5 (decisione 3A): VOX li vede completi, gli altri la prima riga (spunto per gli attacchi)
    { chiave: 'testiSezioni', etichetta: 'Testi nelle sezioni', tipo: 'scelta', valori: ['Completi', 'Prima riga', 'Nascosti'], predefinito: 'Prima riga', perVOX: 'Completi', dalla: 'T5' },
    { chiave: 'metronomoAttivo', etichetta: 'Metronomo attivo', tipo: 'si-no', predefinito: true, dalla: 'T6' },
    { chiave: 'metronomoSuddivisione', etichetta: 'Metronomo: suddivisione', tipo: 'scelta', valori: ['Quarti', 'Ottavi'], predefinito: 'Quarti', dalla: 'T6' },
    { chiave: 'metronomoAccento', etichetta: 'Metronomo: accento sul primo', tipo: 'si-no', predefinito: true, dalla: 'T6' },
    { chiave: 'metronomoVolume', etichetta: 'Metronomo: volume', tipo: 'numero', min: 0, max: 100, passo: 5, predefinito: 80, dalla: 'T6' },
    { chiave: 'metronomoConteggio', etichetta: 'Metronomo: battute di conteggio', tipo: 'scelta', valori: ['0', '1', '2'], predefinito: '1', dalla: 'T6' },
    { chiave: 'metronomoLampeggio', etichetta: 'Metronomo: lampeggio sullo schermo', tipo: 'si-no', predefinito: false, dalla: 'T6' },
    { chiave: 'caratteriPalco', etichetta: 'Caratteri in Modalità Palco', tipo: 'scelta', valori: ['Grandi', 'Molto grandi', 'Enormi'], predefinito: 'Molto grandi', dalla: 'T8' }
  ];
  function giaAttiva(d) { return Number(String(d.dalla).replace('T', '')) <= TAPPA; }

  /** Predefinite; con la sigla VOX alcune cambiano (T5: testi completi). */
  function predefinite(sigla) {
    var o = {};
    for (var i = 0; i < IMPOSTAZIONI.length; i++) {
      var d = IMPOSTAZIONI[i];
      o[d.chiave] = sigla === 'VOX' && d.perVOX !== undefined ? d.perVOX : d.predefinito;
    }
    return o;
  }

  function comeSiNo(v) {
    if (v === true || v === 'true' || v === 'sì' || v === 'si' || v === 'SI' || v === 1) return true;
    if (v === false || v === 'false' || v === 'no' || v === 'NO' || v === 0) return false;
    return null;
  }

  /**
   * Controlla e ripulisce le impostazioni. Restituisce { valori, errori }:
   * i valori non validi tornano al predefinito e finiscono in "errori" (il motore li rifiuta).
   */
  function normalizzaImpostazioni(dati, sigla) {
    var valori = predefinite(sigla || (dati && dati.membro)), errori = [];
    dati = dati || {};
    for (var i = 0; i < IMPOSTAZIONI.length; i++) {
      var d = IMPOSTAZIONI[i], v = dati[d.chiave];
      if (v === undefined || v === null || v === '') continue;
      if (d.tipo === 'si-no') {
        var b = comeSiNo(v);
        if (b === null) errori.push(d.chiave); else valori[d.chiave] = b;
      } else if (d.tipo === 'scelta') {
        if (d.valori.indexOf(String(v)) < 0) errori.push(d.chiave); else valori[d.chiave] = String(v);
      } else if (d.tipo === 'numero') {
        var n = Number(v);
        if (isNaN(n) || n < d.min || n > d.max) errori.push(d.chiave); else valori[d.chiave] = Math.round(n);
      }
    }
    return { valori: valori, errori: errori };
  }

  /* ================= Tonalità =================
   * Sul foglio: forma neutra in lettere inglesi, "b" e "#" ASCII, "m" per il minore (es. "E", "Am", "Bb", "F#m").
   * La band pensa nelle FORME (accordatura Mib): la tonalità scritta è quella delle forme sulla chitarra.
   * (non ovvio) La tonalità trasposta non si calcola nota per nota (uscirebbero nomi come A# maggiore):
   * si prende dalla tabella fissa qui sotto, con la grafia d'uso. Decisione T2 n. 1: F# maggiore, Ebm minore.
   */
  var LETTERE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var MAGGIORI = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINORI = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
  /* Tonalità che si possono scegliere come originale (sui tasti neri entrambe le grafie). */
  var ORIGINALI = {
    maggiori: ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    minori: ['Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bbm', 'Bm']
  };
  var DO_RE_MI = { C: 'DO', D: 'RE', E: 'MI', F: 'FA', G: 'SOL', A: 'LA', B: 'SI' };
  var NOTAZIONI = ['Do Re Mi', 'C D E', 'Entrambe'];

  /** "F#m" → { lettera: 'F', alterazione: '#', minore: true, classe: 6 }, oppure null. */
  function leggiTonalita(t) {
    var m = /^([A-G])(#|b)?(m)?$/.exec(String(t === undefined || t === null ? '' : t).trim());
    if (!m) return null;
    var classe = (LETTERE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    return { lettera: m[1], alterazione: m[2] || '', minore: !!m[3], classe: classe };
  }
  function tonalitaValida(t) { return leggiTonalita(t) !== null; }

  /** Tonalità spostata di n semitoni, con la grafia della tabella. Con n = 0 resta come scritta. */
  function trasponi(t, n) {
    var p = leggiTonalita(t);
    if (!p) return '';
    n = Math.round(Number(n) || 0);
    if (n === 0) return p.lettera + p.alterazione + (p.minore ? 'm' : '');
    var c = (((p.classe + n) % 12) + 12) % 12;
    return p.minore ? MINORI[c] : MAGGIORI[c];
  }

  /* Accordature della band. offset = semitoni dal suono delle forme al suono reale. */
  var ACCORDATURE = [
    { valore: 'Mib', etichetta: 'Mib', offset: -1 },
    { valore: 'Drop Mib', etichetta: 'Drop Mib', offset: -1 }
  ];
  /** Semitoni tra forme e suono reale; null se l'accordatura è vuota o "altra" (non si calcola). */
  function offsetAccordatura(a) {
    for (var i = 0; i < ACCORDATURE.length; i++) if (ACCORDATURE[i].valore === a) return ACCORDATURE[i].offset;
    return null;
  }

  /** Nome da mostrare: note maiuscole, "m" minuscola, simboli ♭ ♯ (decisione T2 n. 2). */
  function nomeTonalita(t, notazione) {
    var p = leggiTonalita(t);
    if (!p) return '';
    var alt = p.alterazione === '#' ? '♯' : p.alterazione === 'b' ? '♭' : '';
    var m = p.minore ? 'm' : '';
    var italiano = DO_RE_MI[p.lettera] + alt + m;
    var inglese = p.lettera + alt + m;
    if (notazione === 'C D E') return inglese;
    if (notazione === 'Entrambe') return italiano + ' · ' + inglese;
    return italiano;
  }

  /**
   * Tutto ciò che serve per mostrare la tonalità di un brano.
   * { suonata, originale, scostamento, reale } in forma neutra + { testo, dettaglio, testoReale } già scritti.
   */
  function tonalitaBrano(brano, notazione, mostraReale) {
    brano = brano || {};
    var orig = String(brano.tonalitaOriginale || '');
    var n = Math.round(Number(brano.scostamento) || 0);
    var suonata = trasponi(orig, n);
    var off = offsetAccordatura(brano.accordatura);
    var reale = suonata && off !== null ? trasponi(suonata, off) : '';
    var segno = n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '';
    return {
      suonata: suonata, originale: tonalitaValida(orig) ? trasponi(orig, 0) : '', scostamento: n, reale: reale,
      testo: suonata ? nomeTonalita(suonata, notazione) : '—',
      dettaglio: suonata && n !== 0 ? segno + ' dall’originale ' + nomeTonalita(orig, notazione) : '',
      testoReale: mostraReale && reale ? 'reale ' + nomeTonalita(reale, notazione) : ''
    };
  }

  /* ================= Brano ================= */
  var METRI = ['4/4', '3/4', '2/4', '2/2', '6/8', '12/8'];
  /**
   * (non ovvio, collaudo T8) La colonna "metro" del foglio non era in testo semplice: Google Fogli ha trasformato
   * "4/4" nella data 4 aprile. Arriva come "2026-04-03T22:00:00.000Z" (mezzanotte di Roma in UTC), come data
   * scritta per esteso ("Sat Apr 04 2026 00:00:00 GMT+0200…") o come oggetto Date.
   * Si prende giorno e mese (arrotondando al giorno più vicino, così il fuso non sposta la data) e si prova
   * giorno/mese e mese/giorno: per i 6 metri ammessi uno solo dei due è valido (4/3, 8/6, 8/12, 4/2 non esistono).
   * Vuoto resta vuoto; un valore che non si riconosce resta com'è (lo segnala chi lo usa).
   */
  var MESI_EN = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  function metroLetto(v) {
    if (v === null || v === undefined || v === '') return '';
    var s = typeof v === 'string' ? v.trim() : v, g = 0, m = 0;
    if (typeof s === 'string' && METRI.indexOf(s) >= 0) return s;
    if (typeof s === 'string') {
      var lunga = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{1,2}) \d{4}/.exec(s);   // String(Date) di Apps Script
      if (lunga && MESI_EN[lunga[1]]) { m = MESI_EN[lunga[1]]; g = Number(lunga[2]); }
      else if (/^\d{4}-\d{2}-\d{2}T/.test(s)) s = new Date(s);
      else return s;
    }
    if (!m && s && typeof s.getTime === 'function') {   // un Date (anche di un altro contesto)
      var t = s.getTime();
      if (isNaN(t)) return String(v);
      var d = new Date(t + 12 * 3600 * 1000);   // mezzanotte in un fuso tra −12 e +12 → stesso giorno in UTC
      m = d.getUTCMonth() + 1; g = d.getUTCDate();
    }
    if (!m) return String(v);
    if (METRI.indexOf(g + '/' + m) >= 0) return g + '/' + m;
    if (METRI.indexOf(m + '/' + g) >= 0) return m + '/' + g;
    return String(v);
  }
  /** Ripulisce in place brani e sezioni di una risposta del motore (o della copia sul telefono). Restituisce quanti ne ha sistemati. */
  function sistemaMetri(r) {
    var n = 0;
    if (!r) return 0;
    [r.brani, r.sezioni].forEach(function (lista) {
      (lista || []).forEach(function (x) {
        if (!x || x.metro === undefined) return;
        var giusto = metroLetto(x.metro);
        if (giusto !== x.metro) { x.metro = giusto; n++; }
      });
    });
    return n;
  }
  var RIFERIMENTI = ['Quarti', 'Ottavi', 'Quarti puntati', 'Minime'];
  /* T3 (decisione 2): il feel non cambia la durata; servirà al metronomo della T6 (ottavi terzinati). */
  var FEEL = ['Dritto', 'Shuffle'];
  var BPM_MIN = 30, BPM_MAX = 300;
  var STATI_BRANO = ['Proposto', 'In prova', 'Definitivo', 'Archivio'];
  /** Con 6/8 e 12/8 si suggeriscono i quarti puntati, con 2/2 le minime (solo un suggerimento). */
  function riferimentoSuggerito(metro) {
    if (metro === '6/8' || metro === '12/8') return 'Quarti puntati';
    return metro === '2/2' ? 'Minime' : 'Quarti';
  }

  /** "3:45" → 225 secondi; "" → ""; non valido → null. */
  function leggiDurata(t) {
    if (t === undefined || t === null || String(t).trim() === '') return '';
    if (typeof t === 'number') return t > 0 && t <= 3600 && Math.round(t) === t ? t : null;
    var m = /^(\d{1,2}):([0-5]\d)$/.exec(String(t).trim());
    if (!m) return null;
    var s = Number(m[1]) * 60 + Number(m[2]);
    return s > 0 && s <= 3600 ? s : null;
  }
  function scriviDurata(s) {
    if (s === '' || s === null || s === undefined || isNaN(Number(s))) return '';
    s = Number(s);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  /** Identificativo di riga: inizia con una lettera (un id di sole cifre diventerebbe un numero nel foglio). */
  function idValido(id) { return typeof id === 'string' && /^r[a-z0-9]{11}$/.test(id); }
  /** (non ovvio) Lo stato di studio ha un id FISSO per brano + membro: due tocchi veloci non creano doppioni. */
  function idStato(branoId, sigla) { return 's' + branoId + sigla; }

  function testo(v, max) { return String(v === undefined || v === null ? '' : v).replace(/\s+$/, '').replace(/^\s+/, '').slice(0, max); }

  /**
   * Controlla e ripulisce i dati generali di un brano. Restituisce { valori, errori }.
   * Lo stato del brano NON passa da qui: lo decide il motore (In prova fino alla T4).
   */
  function normalizzaBrano(d) {
    d = d || {};
    var v = {}, errori = [];
    v.titolo = testo(d.titolo, 120);
    if (!v.titolo) errori.push('titolo');
    v.artista = testo(d.artista, 120);
    v.tonalitaOriginale = testo(d.tonalitaOriginale, 4);
    if (v.tonalitaOriginale && !tonalitaValida(v.tonalitaOriginale)) errori.push('tonalitaOriginale');
    var n = d.scostamento === '' || d.scostamento === undefined || d.scostamento === null ? 0 : Number(d.scostamento);
    if (isNaN(n) || Math.round(n) !== n || n < -11 || n > 11) errori.push('scostamento'); else v.scostamento = n;
    v.accordatura = testo(d.accordatura, 40);
    if (d.bpm === '' || d.bpm === undefined || d.bpm === null) v.bpm = '';
    else {
      var b = Number(d.bpm);
      if (isNaN(b) || Math.round(b) !== b || b < BPM_MIN || b > BPM_MAX) errori.push('bpm'); else v.bpm = b;
    }
    v.riferimento = d.riferimento ? String(d.riferimento) : 'Quarti';
    if (RIFERIMENTI.indexOf(v.riferimento) < 0) errori.push('riferimento');
    v.metro = d.metro ? String(d.metro) : '4/4';
    if (METRI.indexOf(v.metro) < 0) errori.push('metro');
    var s = leggiDurata(d.durataManuale);
    if (s === null) errori.push('durataManuale'); else v.durataManuale = s;
    v.note = testo(d.note, 2000);
    v.feel = d.feel ? String(d.feel) : 'Dritto';
    if (FEEL.indexOf(v.feel) < 0) errori.push('feel');
    return { valori: v, errori: errori };
  }

  /* ================= Tap tempo =================
   * Si batte sull'unità di riferimento del brano. Dopo 2 s di pausa si ricomincia.
   * Dal 4° tocco: media degli intervalli, scartando quelli fuori di oltre il 30% dalla mediana
   * (la mediana non si fa trascinare da un tocco sbagliato). Risultato intero tra 30 e 300.
   */
  var TAP_PAUSA_MS = 2000, TAP_MIN_TOCCHI = 4, TAP_TOCCHI_TENUTI = 8, TAP_SCARTO = 0.3;
  /** Aggiunge un tocco (millisecondi) all'elenco; restituisce il nuovo elenco. */
  function tapAggiungi(tocchi, t) {
    tocchi = (tocchi || []).slice();
    if (tocchi.length && (t - tocchi[tocchi.length - 1] > TAP_PAUSA_MS || t <= tocchi[tocchi.length - 1])) tocchi = [];
    tocchi.push(t);
    return tocchi.slice(-TAP_TOCCHI_TENUTI);
  }
  /** BPM dai tocchi, oppure null se i tocchi sono meno di 4 o il risultato è fuori intervallo. */
  function tapBpm(tocchi) {
    if (!tocchi || tocchi.length < TAP_MIN_TOCCHI) return null;
    var iv = [];
    for (var i = 1; i < tocchi.length; i++) iv.push(tocchi[i] - tocchi[i - 1]);
    var ord = iv.slice().sort(function (a, b) { return a - b; });
    var med = ord.length % 2 ? ord[(ord.length - 1) / 2] : (ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2;
    var buoni = iv.filter(function (x) { return Math.abs(x - med) <= med * TAP_SCARTO; });
    if (buoni.length < TAP_MIN_TOCCHI - 1) return null;
    var media = buoni.reduce(function (a, b) { return a + b; }, 0) / buoni.length;
    var bpm = Math.round(60000 / media);
    return bpm >= BPM_MIN && bpm <= BPM_MAX ? bpm : null;
  }

  /* ================= Stati di studio ================= */
  var STATI_STUDIO = ['Da studiare', 'In studio', 'Da ripassare', 'Lo so'];
  var STATO_PREDEFINITO = 'Da studiare';
  /** Stato di un membro su un brano ("Da studiare" se non l'ha mai toccato). */
  function statoDi(stati, branoId, sigla) {
    for (var i = 0; i < (stati || []).length; i++) if (stati[i].brano === branoId && stati[i].membro === sigla) return stati[i].stato;
    return STATO_PREDEFINITO;
  }
  /** Pronto per tutti = tutti e 5 i membri hanno "Lo so". */
  function prontoPerTutti(stati, branoId) {
    for (var i = 0; i < SIGLE.length; i++) if (statoDi(stati, branoId, SIGLE[i]) !== 'Lo so') return false;
    return true;
  }
  var FILTRI = ['Tutti', 'Pronti per tutti', 'Miei da sistemare'];
  /** Brani che passano il filtro, in ordine alfabetico di titolo. */
  function filtra(brani, stati, filtro, sigla) {
    return (brani || []).filter(function (b) {
      if (filtro === 'Pronti per tutti') return prontoPerTutti(stati, b.id);
      if (filtro === 'Miei da sistemare') return !!sigla && statoDi(stati, b.id, sigla) !== 'Lo so';
      return true;
    }).sort(function (a, b) { return String(a.titolo).localeCompare(String(b.titolo), 'it', { sensitivity: 'base' }); });
  }

  /* ================= T3 · Struttura a sezioni ================= */
  var TIPI_SEZIONE = ['Intro', 'Strofa', 'Pre-rit', 'Rit', 'Bridge', 'Solo', 'Stacco', 'Re-Intro', 'Finale'];
  var MAX_SEZIONI = 40, MAX_RIPETIZIONI = 16, MAX_BATTUTE = 999;
  /* Chi suona: di base suonano tutti; si scrive solo l'eccezione (tacet = non suona, ★ = protagonista). */
  var PARTI = ['tacet', '★'];
  /* Lunghezza di una battuta misurata in quarti, per metro. */
  var QUARTI_PER_BATTUTA = { '4/4': 4, '3/4': 3, '2/4': 2, '2/2': 4, '6/8': 3, '12/8': 6 };
  /* Quanti quarti vale un battito del BPM, per riferimento (BPM in quarti = BPM × questo numero). */
  var QUARTI_PER_BATTITO = { 'Quarti': 1, 'Ottavi': 0.5, 'Quarti puntati': 1.5, 'Minime': 2 };

  function vuoto(v) { return v === '' || v === undefined || v === null; }
  /** Intero facoltativo tra min e max: "" se vuoto, il numero se valido, null se non valido. */
  function interoFacoltativo(v, min, max) {
    if (vuoto(v)) return '';
    var n = Number(v);
    return isNaN(n) || Math.round(n) !== n || n < min || n > max ? null : n;
  }

  /** "BASS:tacet;GTR1:★" → { BASS: 'tacet', GTR1: '★' }; "" → {}; null se non valido. */
  function leggiChiSuona(s) {
    var o = {};
    s = String(vuoto(s) ? '' : s).trim();
    if (!s) return o;
    var parti = s.split(';');
    for (var i = 0; i < parti.length; i++) {
      if (!parti[i].trim()) continue;
      var kv = parti[i].split(':');
      if (kv.length !== 2) return null;
      var sigla = kv[0].trim(), cosa = kv[1].trim();
      if (SIGLE.indexOf(sigla) < 0 || PARTI.indexOf(cosa) < 0 || o[sigla]) return null;
      o[sigla] = cosa;
    }
    return o;
  }
  /** Scrittura per il foglio: solo le eccezioni, sempre nell'ordine VOX GTR1 GTR2 BASS DRUM. */
  function scriviChiSuona(o) {
    var out = [];
    for (var i = 0; i < SIGLE.length; i++) if (o && PARTI.indexOf(o[SIGLE[i]]) >= 0) out.push(SIGLE[i] + ':' + o[SIGLE[i]]);
    return out.join(';');
  }
  /** Al tocco del pallino: suona → tacet → ★ → suona. */
  function parteSuccessiva(cosa) { return !cosa ? 'tacet' : cosa === 'tacet' ? '★' : ''; }
  /** Eccezioni raggruppate per la vista: { tacet: ['BASS'], stella: ['GTR1'] } nell'ordine delle sigle. */
  function gruppiChiSuona(s) {
    var o = (typeof s === 'string' ? leggiChiSuona(s) : s) || {}, g = { tacet: [], stella: [] };
    for (var i = 0; i < SIGLE.length; i++) {
      if (o[SIGLE[i]] === 'tacet') g.tacet.push(SIGLE[i]);
      if (o[SIGLE[i]] === '★') g.stella.push(SIGLE[i]);
    }
    return g;
  }

  /**
   * Controlla e ripulisce una sezione. Restituisce { valori, errori }.
   * Vuoto in bpm / metro / riferimento / feel = "come il brano". Il campo "testo" (T5) non passa da qui.
   */
  function normalizzaSezione(d) {
    d = d || {};
    var v = {}, errori = [];
    v.id = d.id;
    if (!idValido(d.id)) errori.push('id');
    v.tipo = String(vuoto(d.tipo) ? '' : d.tipo);
    if (TIPI_SEZIONE.indexOf(v.tipo) < 0) errori.push('tipo');
    v.nome = testo(d.nome, 40);
    var rip = interoFacoltativo(d.ripetizioni, 1, MAX_RIPETIZIONI);
    if (rip === null) errori.push('ripetizioni'); else v.ripetizioni = rip === '' ? 1 : rip;
    var bt = interoFacoltativo(d.battute, 1, MAX_BATTUTE);
    if (bt === null) errori.push('battute'); else v.battute = bt;
    var bp = interoFacoltativo(d.bpm, BPM_MIN, BPM_MAX);
    if (bp === null) errori.push('bpm'); else v.bpm = bp;
    v.metro = vuoto(d.metro) ? '' : String(d.metro);
    if (v.metro && METRI.indexOf(v.metro) < 0) errori.push('metro');
    v.riferimento = vuoto(d.riferimento) ? '' : String(d.riferimento);
    if (v.riferimento && RIFERIMENTI.indexOf(v.riferimento) < 0) errori.push('riferimento');
    v.feel = vuoto(d.feel) ? '' : String(d.feel);
    if (v.feel && FEEL.indexOf(v.feel) < 0) errori.push('feel');
    v.nota = testo(d.nota, 200);
    var cs = leggiChiSuona(d.chiSuona);
    if (cs === null) errori.push('chiSuona'); else v.chiSuona = scriviChiSuona(cs);
    return { valori: v, errori: errori };
  }

  /**
   * Struttura intera di un brano, nell'ordine in cui arriva. Restituisce { valori, errori }:
   * valori con "ordine" da 1 a n; errori = [{ indice, campi }] (indice -1 = la struttura in sé).
   */
  function normalizzaStruttura(lista) {
    if (!lista || typeof lista.length !== 'number' || typeof lista === 'string') return { valori: [], errori: [{ indice: -1, campi: ['sezioni'] }] };
    if (lista.length > MAX_SEZIONI) return { valori: [], errori: [{ indice: -1, campi: ['troppe'] }] };
    var valori = [], errori = [], visti = {};
    for (var i = 0; i < lista.length; i++) {
      var n = normalizzaSezione(lista[i]);
      if (n.valori.id && visti[n.valori.id]) n.errori.push('doppione');
      visti[n.valori.id] = true;
      if (n.errori.length) errori.push({ indice: i, campi: n.errori });
      n.valori.ordine = i + 1;
      valori.push(n.valori);
    }
    return { valori: valori, errori: errori };
  }

  /** Nomi da mostrare: il nome libero, altrimenti il tipo, numerato se ce n'è più di uno (Strofa 1, Strofa 2). */
  function nomiSezioni(sezioni) {
    var totali = {}, visti = {}, out = [];
    sezioni = sezioni || [];
    for (var i = 0; i < sezioni.length; i++) if (!testo(sezioni[i].nome, 40)) totali[sezioni[i].tipo] = (totali[sezioni[i].tipo] || 0) + 1;
    for (var j = 0; j < sezioni.length; j++) {
      var s = sezioni[j], nome = testo(s.nome, 40);
      if (nome) { out.push(nome); continue; }
      visti[s.tipo] = (visti[s.tipo] || 0) + 1;
      out.push(totali[s.tipo] > 1 ? s.tipo + ' ' + visti[s.tipo] : String(s.tipo));
    }
    return out;
  }

  /** BPM, metro, riferimento e feel che valgono per la sezione: i suoi cambi, altrimenti quelli del brano. */
  function tempoSezione(sez, brano) {
    sez = sez || {}; brano = brano || {};
    return {
      bpm: !vuoto(sez.bpm) ? Number(sez.bpm) : (vuoto(brano.bpm) ? '' : Number(brano.bpm)),
      metro: metroLetto(sez.metro) || metroLetto(brano.metro) || '4/4',
      riferimento: sez.riferimento || brano.riferimento || 'Quarti',
      feel: sez.feel || brano.feel || 'Dritto'
    };
  }
  /** Secondi di una sezione (NON arrotondati), oppure null se mancano le battute o il BPM. */
  function secondiSezione(sez, brano) {
    var t = tempoSezione(sez, brano);
    var bt = Number(sez.battute);
    if (vuoto(sez.battute) || !(bt > 0) || !(t.bpm > 0)) return null;
    var rip = Number(sez.ripetizioni) || 1;
    return bt * rip * QUARTI_PER_BATTUTA[t.metro] * 60 / (t.bpm * QUARTI_PER_BATTITO[t.riferimento]);
  }
  /**
   * Durata calcolata dalla struttura: { secondi, senzaBattute, senzaBpm, sezioni }.
   * secondi = null se non ci sono sezioni o se ad almeno una mancano le battute o il BPM (nomi negli elenchi).
   * (non ovvio) Si arrotonda al secondo solo il totale: arrotondando ogni sezione, 20 sezioni
   * accumulerebbero fino a ±10 s di errore.
   */
  function durataStruttura(brano, sezioni) {
    sezioni = sezioni || [];
    var nomi = nomiSezioni(sezioni), tot = 0, senzaBattute = [], senzaBpm = [];
    for (var i = 0; i < sezioni.length; i++) {
      var s = sezioni[i];
      if (vuoto(s.battute)) { senzaBattute.push(nomi[i]); continue; }
      var x = secondiSezione(s, brano);
      if (x === null) senzaBpm.push(nomi[i]); else tot += x;
    }
    var calcolabile = sezioni.length > 0 && !senzaBattute.length && !senzaBpm.length;
    return { secondi: calcolabile ? Math.round(tot) : null, senzaBattute: senzaBattute, senzaBpm: senzaBpm, sezioni: sezioni.length };
  }
  /** Decisione T3 n. 4: vale la durata manuale quando è scritta, altrimenti la calcolata. */
  function durataEffettiva(brano, sezioni) {
    var man = brano && !vuoto(brano.durataManuale) ? Number(brano.durataManuale) : 0;
    if (man > 0) return { secondi: man, fonte: 'manuale' };
    var c = durataStruttura(brano, sezioni).secondi;
    return c === null ? { secondi: null, fonte: '' } : { secondi: c, fonte: 'calcolata' };
  }
  /** Differenza in secondi già scritta: "−4 s", "+3:04", "uguali". */
  function scriviDifferenza(sec) {
    if (!sec) return 'uguali';
    var a = Math.abs(sec);
    return (sec > 0 ? '+' : '−') + (a < 60 ? a + ' s' : scriviDurata(a));
  }

  /* ================= T5 · Testi =================
   * Il testo si scrive DENTRO le sezioni: Sezioni.testo = id di una riga della scheda Testi.
   * Un ritornello identico è UN solo testo collegato a più sezioni (decisione 1A).
   * Tutto quello che segue gira sul telefono (schermata di controllo); il motore controlla solo i testi salvati.
   */
  var MAX_TESTO = 5000, MAX_TESTI = 40;
  var LINGUE_OCR = [{ valore: 'it', etichetta: 'Italiano' }, { valore: 'en', etichetta: 'Inglese' }];
  var SOGLIA_QUASI_UGUALE = 0.8;
  var GIORNI_NOVITA = 7;
  /* Caratteri invisibili che arrivano incollando da siti e app (spazio di larghezza zero, BOM…). */
  var INVISIBILI = new RegExp('[' + String.fromCharCode(0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00AD) + ']', 'g');
  var SPAZI_STRANI = new RegExp('[\t' + String.fromCharCode(0x00A0, 0x2007, 0x202F) + ']', 'g');

  /** A capo di Windows e Mac sistemati, caratteri invisibili tolti, spazi in fondo alle righe tolti. */
  function testoPulitoBase(t) {
    return String(vuoto(t) ? '' : t).replace(/\r\n?/g, '\n').replace(INVISIBILI, '').replace(SPAZI_STRANI, ' ')
      .split('\n').map(function (r) { return r.replace(/\s+$/, ''); }).join('\n');
  }
  /** Testo pronto per il foglio: al massimo una riga vuota di fila, niente righe vuote in testa e in coda. */
  function testoDaSalvare(t) {
    return testoPulitoBase(t).replace(/\n{3,}/g, '\n\n').replace(/^\s*\n/, '').replace(/\n\s*$/, '').replace(/^\s+|\s+$/g, '');
  }

  /* Righe di soli accordi (decisione v1: niente accordi sul testo). Radici inglesi e italiane; le italiane
   * solo maiuscole o con l'iniziale maiuscola, così "la la la" o "mi manchi" restano testo. */
  var RADICE = '(?:[A-G]|DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)';
  var ALTERAZ = '(?:#|b|♯|♭)?';
  var RE_ACCORDO = new RegExp('^\\(?' + RADICE + ALTERAZ + '(?:m|min|maj|M|dim|aug|sus|add|\\+|-|°|ø)?(?:\\d{1,2})?' +
    '(?:(?:sus|add|maj|b|#|\\+|-)\\d{1,2})*(?:\\/' + RADICE + ALTERAZ + ')?\\)?$');
  var RE_SEGNO = /^(?:\||\/|-|–|x\d{1,2}|\d{1,2}x|N\.?C\.?|\(|\)|\.{1,3}|%)$/i;
  function rigaDiAccordi(riga) {
    var t = String(riga).trim().split(/\s+/), accordi = 0;
    if (!t[0]) return false;
    for (var i = 0; i < t.length; i++) {
      if (RE_ACCORDO.test(t[i])) accordi++;
      else if (!RE_SEGNO.test(t[i])) return false;
    }
    return accordi > 0;
  }

  /* Etichette dei siti di testi e dei fogli scritti a mano: suggeriscono il tipo e si tolgono dal testo. */
  var ETICHETTE = [
    [/^re-?intro$/, 'Re-Intro'], [/^intro$/, 'Intro'],
    [/^(?:pre-?rit(?:ornello)?|pre-?chorus)$/, 'Pre-rit'],
    [/^(?:rit(?:ornello)?|chorus|refrain|ritornello finale|final chorus)$/, 'Rit'],
    [/^(?:strofa|verse|strofe)$/, 'Strofa'], [/^(?:bridge|ponte|middle 8)$/, 'Bridge'],
    [/^(?:solo|assolo|instrumental|strumentale|interludio|interlude|guitar solo)$/, 'Solo'], [/^stacco$/, 'Stacco'],
    [/^(?:finale|outro|coda)$/, 'Finale']
  ];
  var RE_RIPETI = /^[(\[]?\s*(?:x|×)\s*(\d{1,2})\s*[)\]]?$|^[(\[]?\s*(\d{1,2})\s*(?:x|×)\s*[)\]]?$/i;
  /** "[Chorus x2]", "Rit.:", "(Strofa 2)", "Pre-chorus" → { tipo, ripetizioni }, oppure null. */
  function leggiEtichetta(riga) {
    var s = String(riga).trim().toLowerCase();
    if (!s || s.length > 32) return null;
    s = s.replace(/^[\[({<]\s*/, '').replace(/\s*[\])}>]\s*:?$/, '').replace(/\s*:$/, '').trim();
    var rip = 1, m = /\s*[(\[]?\s*(?:x|×)\s*(\d{1,2})\s*[)\]]?$|\s*[(\[]?\s*(\d{1,2})\s*(?:x|×)\s*[)\]]?$/.exec(s);
    if (m && m.index > 0) { rip = Number(m[1] || m[2]); s = s.slice(0, m.index).trim(); }
    s = s.replace(/[.:]+$/, '').replace(/\s+\d{1,2}$/, '').replace(/[.:]+$/, '').trim();
    for (var i = 0; i < ETICHETTE.length; i++) if (ETICHETTE[i][0].test(s)) return { tipo: ETICHETTE[i][1], ripetizioni: Math.max(1, Math.min(MAX_RIPETIZIONI, rip)) };
    return null;
  }
  var STRUMENTALI = ['Intro', 'Solo', 'Stacco', 'Re-Intro', 'Finale'];

  /** Chiave per confrontare due blocchi: minuscole, senza punteggiatura, spazi semplici. */
  function chiaveBlocco(t) {
    return String(t).toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9àáâäèéêëìíîïòóôöùúûüñç\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  /** Somiglianza tra due blocchi (0…1) sulle parole, con la sottosequenza comune più lunga. */
  function somiglianza(a, b) {
    var x = chiaveBlocco(a).split(' '), y = chiaveBlocco(b).split(' ');
    if (!x[0] || !y[0]) return 0;
    var prec = [], cur = [], i, j;
    for (j = 0; j <= y.length; j++) prec[j] = 0;
    for (i = 1; i <= x.length; i++) {
      cur = [0];
      for (j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prec[j - 1] + 1 : Math.max(prec[j], cur[j - 1]);
      prec = cur;
    }
    return 2 * prec[y.length] / (x.length + y.length);
  }

  /**
   * Analizza un testo incollato, dettato o letto da foto. Restituisce
   * { blocchi: [{ testo, righe, tipo, daEtichetta, ripetizioni, gruppo, primo, strumentale, quasiUgualeA }],
   *   accordiTolti, etichette, senzaRigheVuote }.
   * - blocchi separati dalle righe vuote; righe di soli accordi tolte; etichette usate e tolte;
   * - due blocchi identici di fila (o "x2") = un blocco ×2; "[Chorus]" da solo = ripete l'ultimo ritornello;
   *   "[Solo]" da solo = sezione strumentale senza testo;
   * - gruppo = blocchi identici (stesso testo, decisione 1A); quasiUgualeA = blocco simile di un altro gruppo (2A).
   */
  function analizzaTesto(grezzo) {
    var righe = testoPulitoBase(grezzo).split('\n'), grezzi = [], cur = null, tolte = 0, etichette = 0;
    var chiudi = function () { if (cur && (cur.righe.length || cur.tipo)) grezzi.push(cur); cur = null; };
    var nuovo = function (et) { cur = { righe: [], tipo: et ? et.tipo : '', ripetizioni: et ? et.ripetizioni : 1, daEtichetta: !!et }; };
    for (var i = 0; i < righe.length; i++) {
      var t = righe[i].trim();
      if (!t) { chiudi(); continue; }
      if (rigaDiAccordi(t)) { tolte++; continue; }
      var rep = RE_RIPETI.exec(t);
      if (rep) {
        var n = Math.min(MAX_RIPETIZIONI, Number(rep[1] || rep[2]));
        if (cur && cur.righe.length) cur.ripetizioni = n; else if (grezzi.length) grezzi[grezzi.length - 1].ripetizioni = n;
        etichette++; continue;
      }
      var et = leggiEtichetta(t);
      if (et) { chiudi(); nuovo(et); etichette++; continue; }
      var il = /^([^:]{2,24}):\s*(\S.*)$/.exec(t), eti = il ? leggiEtichetta(il[1]) : null;
      if (eti) { chiudi(); nuovo(eti); etichette++; t = il[2]; }
      if (!cur) nuovo(null);
      cur.righe.push(t);
    }
    chiudi();
    // etichetta sola: ripete un ritornello già visto, oppure è uno strumentale, oppure vale per il blocco dopo
    var blocchi = [];
    for (var k = 0; k < grezzi.length; k++) {
      var g = grezzi[k];
      if (!g.righe.length) {
        var gia = null;
        for (var q = blocchi.length - 1; q >= 0; q--) if (blocchi[q].tipo === g.tipo && blocchi[q].righe.length) { gia = blocchi[q]; break; }
        if (gia) { blocchi.push({ righe: gia.righe.slice(), tipo: g.tipo, ripetizioni: g.ripetizioni, daEtichetta: true }); continue; }
        if (STRUMENTALI.indexOf(g.tipo) >= 0) { blocchi.push({ righe: [], tipo: g.tipo, ripetizioni: g.ripetizioni, daEtichetta: true, strumentale: true }); continue; }
        if (k + 1 < grezzi.length && grezzi[k + 1].righe.length && !grezzi[k + 1].daEtichetta) {
          grezzi[k + 1].tipo = g.tipo; grezzi[k + 1].daEtichetta = true; grezzi[k + 1].ripetizioni = Math.max(grezzi[k + 1].ripetizioni, g.ripetizioni);
        }
        continue;
      }
      blocchi.push(g);
    }
    // un blocco fatto dello stesso pezzo ripetuto (senza riga vuota in mezzo) = un pezzo ×n
    blocchi.forEach(function (b) {
      for (var k = 4; k >= 2; k--) {
        if (b.strumentale || b.righe.length < 2 * k - 1 || b.righe.length % k) continue;
        var l = b.righe.length / k, primo = chiaveBlocco(b.righe.slice(0, l).join('\n')), tutti = true;
        for (var c = 1; c < k; c++) if (chiaveBlocco(b.righe.slice(c * l, (c + 1) * l).join('\n')) !== primo) tutti = false;
        if (tutti && l >= 1 && primo) { b.righe = b.righe.slice(0, l); b.ripetizioni = Math.min(MAX_RIPETIZIONI, b.ripetizioni * k); break; }
      }
    });
    // due blocchi identici di fila = un blocco ripetuto
    var uniti = [];
    blocchi.forEach(function (b) {
      var u = uniti[uniti.length - 1];
      if (u && !b.strumentale && !u.strumentale && b.righe.length && chiaveBlocco(b.righe.join('\n')) === chiaveBlocco(u.righe.join('\n')) && (!b.daEtichetta || b.tipo === u.tipo)) {
        u.ripetizioni = Math.min(MAX_RIPETIZIONI, u.ripetizioni + b.ripetizioni);
      } else uniti.push(b);
    });
    // gruppi di blocchi identici
    var chiavi = {}, nGruppi = 0, conta = [];
    uniti.forEach(function (b) {
      b.testo = b.righe.join('\n');
      if (b.strumentale) { b.gruppo = -1; return; }
      var c = chiaveBlocco(b.testo);
      if (!(c in chiavi)) { chiavi[c] = nGruppi++; conta.push(0); b.primo = true; } else b.primo = false;
      b.gruppo = chiavi[c]; conta[b.gruppo]++;
    });
    // tipo dei blocchi senza etichetta (decisione 6A)
    var gruppoRit = -1, meglio = 1, lung = -1;
    uniti.forEach(function (b) { if (b.daEtichetta && b.tipo === 'Rit' && gruppoRit < 0) gruppoRit = b.gruppo; });
    if (gruppoRit < 0) uniti.forEach(function (b) {
      if (b.gruppo < 0) return;
      var n = conta[b.gruppo], l = b.testo.length;
      if (n > meglio || (n === meglio && n >= 2 && l > lung)) { gruppoRit = b.gruppo; meglio = n; lung = l; }
    });
    var posRit = [];
    uniti.forEach(function (b, i) { if (b.gruppo === gruppoRit && gruppoRit >= 0) posRit.push(i); });
    var righeRit = posRit.length ? uniti[posRit[0]].righe.length : 0;
    var bridgeFatto = uniti.some(function (b) { return b.daEtichetta && b.tipo === 'Bridge'; });
    // quasi uguali (decisione 2A): segnalati, NON uniti
    uniti.forEach(function (b, i) {
      b.quasiUgualeA = -1;
      if (b.gruppo < 0 || !b.primo) return;
      for (var j = 0; j < i; j++) {
        var a = uniti[j];
        if (a.gruppo >= 0 && a.gruppo !== b.gruppo && a.primo && somiglianza(a.testo, b.testo) >= SOGLIA_QUASI_UGUALE) { b.quasiUgualeA = j; break; }
      }
    });
    uniti.forEach(function (b, i) {
      if (b.daEtichetta || b.strumentale) return;
      if (b.gruppo === gruppoRit && gruppoRit >= 0) { b.tipo = 'Rit'; return; }
      // quasi uguale a un ritornello (una parola diversa, un "oh oh" in più): è un ritornello, con il suo testo
      if (b.quasiUgualeA >= 0 && uniti[b.quasiUgualeA].gruppo === gruppoRit && gruppoRit >= 0) { b.tipo = 'Rit'; return; }
      var ogniVoltaPrimaDelRit = conta[b.gruppo] >= 2 && uniti.every(function (x, j) { return x.gruppo !== b.gruppo || (j + 1 < uniti.length && uniti[j + 1].gruppo === gruppoRit); });
      if (ogniVoltaPrimaDelRit && b.righe.length <= Math.max(righeRit, 4)) { b.tipo = 'Pre-rit'; return; }
      if (!bridgeFatto && conta[b.gruppo] === 1 && posRit.length >= 2 && i > posRit[1]) { b.tipo = 'Bridge'; bridgeFatto = true; return; }
      b.tipo = 'Strofa';
    });
    var conTesto = uniti.filter(function (b) { return !b.strumentale; });
    return {
      blocchi: uniti.map(function (b) {
        return { testo: b.testo, righe: b.righe.length, tipo: b.tipo || 'Strofa', daEtichetta: !!b.daEtichetta, ripetizioni: b.ripetizioni || 1,
          gruppo: b.gruppo, primo: !!b.primo, strumentale: !!b.strumentale, quasiUgualeA: b.quasiUgualeA };
      }),
      accordiTolti: tolte, etichette: etichette,
      senzaRigheVuote: conTesto.length === 1 && conTesto[0].righe.length > 8
    };
  }

  /** Brano SENZA struttura: la struttura proposta dal testo, con i segnaposto Intro / Finale facoltativi. */
  function proponiStruttura(analisi, opzioni) {
    opzioni = opzioni || {};
    var b = (analisi && analisi.blocchi) || [], out = [];
    if (opzioni.intro && !(b[0] && b[0].tipo === 'Intro')) out.push({ tipo: 'Intro', ripetizioni: 1, blocco: -1 });
    b.forEach(function (x, i) { out.push({ tipo: x.tipo, ripetizioni: x.ripetizioni, blocco: x.strumentale ? -1 : i }); });
    if (opzioni.finale && !(b.length && b[b.length - 1].tipo === 'Finale')) out.push({ tipo: 'Finale', ripetizioni: 1, blocco: -1 });
    return out.slice(0, MAX_SEZIONI);
  }

  /** Sezioni dove canta la voce: non quelle con VOX tacet, non i Solo e gli Stacchi. */
  function sezioneCantata(s) {
    var cs = leggiChiSuona(s && s.chiSuona) || {};
    return cs.VOX !== 'tacet' && s.tipo !== 'Solo' && s.tipo !== 'Stacco';
  }
  /**
   * Brano CON struttura: per ogni blocco l'id della sezione dove va, oppure 'nuova' (in fondo) o '' (strumentale).
   * In ordine sulle sezioni cantate; (non ovvio) un blocco cerca una sezione del suo stesso tipo tra le prossime due
   * cantate (un blocco con l'etichetta, o un Intro / Finale, la cerca fino in fondo), e Intro / Re-Intro / Finale si
   * usano solo se il blocco è dello stesso tipo: così la prima strofa non finisce sull'Intro quando VOX non è
   * segnato tacet, e un "[Outro]" va sul Finale anche se prima ci sono altri ritornelli.
   */
  function abbinaAStruttura(analisi, sezioni) {
    var cand = (sezioni || []).filter(sezioneCantata), p = 0, out = [];
    var bordo = ['Intro', 'Re-Intro', 'Finale'];
    ((analisi && analisi.blocchi) || []).forEach(function (b) {
      if (b.strumentale) { out.push(''); return; }
      var trovata = -1;
      var fin = b.daEtichetta || bordo.indexOf(b.tipo) >= 0 ? cand.length : Math.min(cand.length, p + 2);
      for (var j = p; j < fin; j++) if (cand[j].tipo === b.tipo) { trovata = j; break; }
      if (trovata < 0) for (var k = p; k < cand.length; k++) if (bordo.indexOf(cand[k].tipo) < 0 || cand[k].tipo === b.tipo) { trovata = k; break; }
      if (trovata < 0) { out.push('nuova'); p = cand.length; return; }
      out.push(cand[trovata].id); p = trovata + 1;
    });
    return out;
  }

  /** Controlla e ripulisce un testo da salvare. Restituisce { valori: { id, brano, etichetta, testo }, errori }. */
  function normalizzaTesto(d) {
    d = d || {};
    var v = {}, errori = [];
    v.id = d.id;
    if (!idValido(d.id)) errori.push('id');
    v.etichetta = testo(d.etichetta, 40);
    var t = testoDaSalvare(d.testo);
    if (!t) errori.push('vuoto');
    if (t.length > MAX_TESTO) errori.push('lungo');
    v.testo = t.slice(0, MAX_TESTO);
    return { valori: v, errori: errori };
  }
  /** Prima riga del testo (per la vista "Prima riga" e i testi non collegati). */
  function primaRiga(t) {
    var r = String(vuoto(t) ? '' : t).split('\n').filter(function (x) { return x.trim(); });
    return r.length ? r[0].trim() + (r.length > 1 ? ' …' : '') : '';
  }

  /* ================= T5 · Avvisi della bacheca ================= */
  var TIPI_AVVISO = ['struttura dal testo', 'sezioni in fondo', 'testo abbinato', 'nuovo brano'];
  /** Testo dell'avviso "Da sistemare" (decisione 6A con bacheca). */
  function testoAvvisoTesto(tipo, nuove) {
    if (tipo === 'struttura dal testo') return 'La struttura è stata creata dal testo: aggiungi Intro, Solo, Stacchi e battute.';
    if (tipo === 'sezioni in fondo') return (nuove === 1 ? '1 sezione nuova in fondo' : nuove + ' sezioni nuove in fondo') + ': trascinale al posto giusto.';
    return 'Controlla che ogni strofa sia nella sezione giusta.';
  }
  /** Data "yyyy-MM-ddTHH:mm:ss" di n giorni prima (per gli ultimi 7 giorni), con l'ora del telefono o del motore. */
  function giorniPrima(adesso, n) {
    var d = new Date(String(adesso).replace(' ', 'T'));
    d.setDate(d.getDate() - n);
    var z = function (x) { return ('0' + x).slice(-2); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }

  /* ================= T6 · Metronomo =================
   * Le posizioni dei colpi sono in BATTITI del riferimento (0 = inizio della battuta); i secondi li calcola
   * l'orologio audio (metronomo.js) con il BPM e il rallentamento. Così le regole restano provabili qui.
   */
  var TEMPO_MIN = 50, TEMPO_MAX = 100, TEMPO_PASSO = 5;
  function tempoValido(t) { return typeof t === 'number' && t >= TEMPO_MIN && t <= TEMPO_MAX && t % TEMPO_PASSO === 0; }
  /** Battiti del riferimento in una battuta (può non essere intero, es. 4/4 a quarti puntati = 8/3). */
  function battitiPerBattuta(metro, riferimento) { return QUARTI_PER_BATTUTA[metro] / QUARTI_PER_BATTITO[riferimento]; }
  function battitiInteri(metro, riferimento) {
    var n = battitiPerBattuta(metro, riferimento);
    return n > 0 && Math.abs(n - Math.round(n)) < 1e-9;
  }

  /**
   * Colpi di una battuta: [{ pos, tipo }] con tipo 'accento' | 'battito' | 'suddivisione', in ordine.
   * opzioni: { ottavi, accento, battiti } (battiti: per forzare il numero di battiti, usato dal libero non intero).
   * - Quarti: con Ottavi +1 colpo a metà del battito; con lo Shuffle a 2/3.
   * - Minime: con Ottavi +1 a metà (lo Shuffle si ignora).
   * - Quarti puntati: con Ottavi +2 a 1/3 e 2/3 (lo Shuffle si ignora: è già ternario).
   * - Ottavi: i colpi sono già ottavi; con lo Shuffle il secondo di ogni coppia cade a 2/3 del quarto (4/3 di ottavo).
   */
  function colpiBattuta(metro, riferimento, feel, opzioni) {
    opzioni = opzioni || {};
    var n = opzioni.battiti || Math.round(battitiPerBattuta(metro, riferimento));
    var shuffle = feel === 'Shuffle', out = [];
    for (var k = 0; k < n; k++) {
      var p = k;
      if (riferimento === 'Ottavi' && shuffle && k % 2 === 1) p = k - 1 + 4 / 3;
      out.push({ pos: p, tipo: k === 0 && opzioni.accento && !opzioni.battiti ? 'accento' : 'battito' });
      if (!opzioni.ottavi) continue;
      if (riferimento === 'Quarti') out.push({ pos: k + (shuffle ? 2 / 3 : 0.5), tipo: 'suddivisione' });
      else if (riferimento === 'Minime') out.push({ pos: k + 0.5, tipo: 'suddivisione' });
      else if (riferimento === 'Quarti puntati') { out.push({ pos: k + 1 / 3, tipo: 'suddivisione' }); out.push({ pos: k + 2 / 3, tipo: 'suddivisione' }); }
    }
    return out.sort(function (a, b) { return a.pos - b.pos; });
  }

  /** Un tratto del piano: una sezione (o il conteggio, o il libero) con tutto ciò che serve all'orologio. */
  function trattoMetronomo(t, nome, battute, giri, opzioni, extra) {
    var interi = battitiInteri(t.metro, t.riferimento);
    var o = {
      sezione: '', nome: nome, battute: battute, giri: giri, conteggio: false,
      bpm: Number(t.bpm), metro: t.metro, riferimento: t.riferimento, feel: t.feel || 'Dritto',
      battitiBattuta: interi ? Math.round(battitiPerBattuta(t.metro, t.riferimento)) : 1,
      colpi: colpiBattuta(t.metro, t.riferimento, t.feel, { ottavi: !!opzioni.ottavi, accento: !!opzioni.accento, battiti: interi ? 0 : 1 })
    };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }
  /** Battute di conteggio (0, 1 o 2) con il tempo del primo tratto; con battiti non interi: battute da 1 battito. */
  function conteggioMetronomo(primo, opzioni) {
    var n = Number(opzioni.conteggio) || 0;
    if (!n || !primo) return [];
    var interi = battitiInteri(primo.metro, primo.riferimento);
    var battute = interi ? n : n * Math.max(1, Math.round(battitiPerBattuta(primo.metro, primo.riferimento)));
    return [trattoMetronomo(primo, 'conteggio', battute, 1, opzioni, { conteggio: true })];
  }

  /** Metronomo libero (anche da solo, senza brano): tempo fisso finché non si ferma. tempo = { bpm, metro, riferimento, feel }. */
  function pianoLibero(tempo, opzioni, motivo) {
    opzioni = opzioni || {};
    var t = { bpm: Number(tempo.bpm), metro: tempo.metro || '4/4', riferimento: tempo.riferimento || 'Quarti', feel: tempo.feel || 'Dritto' };
    if (!(t.bpm >= BPM_MIN && t.bpm <= BPM_MAX)) return { modo: 'nessuno', motivo: 'Scrivi il BPM del brano', tratti: [] };
    var libero = trattoMetronomo(t, 'libero', null, 1, opzioni);
    return { modo: 'libero', motivo: motivo || '', tratti: conteggioMetronomo(t, opzioni).concat([libero]) };
  }

  /**
   * Piano del metronomo per un brano (decisione di Francesco, T6):
   * - "struttura" se ogni sezione ha le battute, un BPM (suo o del brano) e battiti per battuta interi:
   *   si percorre tutta (da opzioni.daSezione, se c'è) e ci si ferma dopo l'ultima battuta;
   * - altrimenti "libero" con il tempo del brano, e il motivo da mostrare;
   * - "nessuno" se serve il libero ma il brano non ha il BPM.
   * opzioni: { daSezione, ottavi, accento, conteggio: '0' | '1' | '2' }.
   */
  function pianoMetronomo(brano, sezioni, opzioni) {
    brano = brano || {}; sezioni = sezioni || []; opzioni = opzioni || {};
    var tempoBrano = { bpm: brano.bpm, metro: metroLetto(brano.metro) || '4/4', riferimento: brano.riferimento || 'Quarti', feel: brano.feel || 'Dritto' };
    if (!sezioni.length) return pianoLibero(tempoBrano, opzioni, 'libero: il brano non ha ancora una struttura');
    var nomi = nomiSezioni(sezioni), senzaBattute = [], senzaBpm = [], nonIntere = [], senzaMetro = [];
    sezioni.forEach(function (s, i) {
      var t = tempoSezione(s, brano);
      if (vuoto(s.battute) || !(Number(s.battute) > 0)) senzaBattute.push(nomi[i]);
      else if (!(t.bpm > 0)) senzaBpm.push(nomi[i]);
      else if (!QUARTI_PER_BATTUTA[t.metro]) senzaMetro.push(nomi[i]);
      else if (!battitiInteri(t.metro, t.riferimento)) nonIntere.push(nomi[i] + ' (' + t.metro + ' a ' + t.riferimento.toLowerCase() + ')');
    });
    // (collaudo T8) "mancanza" dice al palco cosa manca e dove, per scriverlo in una riga sola
    var conMancanza = function (p, cosa, lista) { p.mancanza = { cosa: cosa, sezioni: lista.map(function (x) { return x.replace(/ \(.*\)$/, ''); }), totale: sezioni.length }; return p; };
    if (senzaBattute.length) return conMancanza(pianoLibero(tempoBrano, opzioni, 'libero: mancano le battute in ' + senzaBattute.join(', ')), 'mancano le battute', senzaBattute);
    if (senzaBpm.length) return conMancanza(pianoLibero(tempoBrano, opzioni, 'libero: manca il BPM in ' + senzaBpm.join(', ')), 'manca il BPM', senzaBpm);
    if (senzaMetro.length) return conMancanza(pianoLibero(tempoBrano, opzioni, 'libero: metro non riconosciuto in ' + senzaMetro.join(', ')), 'metro non riconosciuto', senzaMetro);
    if (nonIntere.length) return conMancanza(pianoLibero(tempoBrano, opzioni, 'libero: battute non intere in ' + nonIntere.join(', ')), 'battute non intere', nonIntere);
    var da = 0;
    sezioni.forEach(function (s, i) { if (opzioni.daSezione && s.id === opzioni.daSezione) da = i; });
    var tratti = [];
    for (var i = da; i < sezioni.length; i++) {
      var s = sezioni[i];
      tratti.push(trattoMetronomo(tempoSezione(s, brano), nomi[i], Number(s.battute), Number(s.ripetizioni) || 1, opzioni, { sezione: s.id }));
    }
    return { modo: 'struttura', motivo: '', tratti: conteggioMetronomo(tratti[0], opzioni).concat(tratti) };
  }

  /** Secondi di un battito del tratto, con il rallentamento in percento (100 = tempo scritto). */
  function secondiBattito(tratto, tempo) { return 60 / (tratto.bpm * (Number(tempo) || 100) / 100); }
  /** Durata del piano senza il conteggio; null se c'è un tratto senza fine (libero). */
  function durataPiano(piano, tempo) {
    var tot = 0;
    for (var i = 0; i < piano.tratti.length; i++) {
      var t = piano.tratti[i];
      if (t.conteggio) continue;
      if (t.battute === null) return null;
      tot += t.battute * t.giri * t.battitiBattuta * secondiBattito(t, tempo);
    }
    return tot;
  }


  /* ================= T7 · Serate e scaletta =================
   * Una serata ha data (testo "aaaa-mm-gg"), locale, orario d'inizio facoltativo ("hh:mm") e note.
   * La scaletta è una lista di righe: brano, pausa (minuti), bis (divisorio) e riga libera (testo + minuti facoltativi).
   * Le durate sono SOLO musica (decisione 1A): la somma dei brani; i minuti delle righe libere si scrivono a parte.
   */
  var TIPI_RIGA = ['brano', 'pausa', 'bis', 'libera'];
  var MAX_SCALETTA = 60, PAUSA_MIN = 1, PAUSA_MAX = 120, PAUSA_PROPOSTA = 15;
  var MAX_LIBERA = 60, MAX_MINUTI_LIBERA = 120, MAX_NOTA_RIGA = 200;
  var MAX_LOCALE = 80, MAX_NOTE_SERATA = 500;
  var GIORNI_SETT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  /** "2026-12-12" valida (anche il 29 febbraio solo negli anni bisestili); altrimenti null. */
  function leggiData(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(vuoto(t) ? '' : t).trim());
    if (!m) return null;
    var a = Number(m[1]), me = Number(m[2]), g = Number(m[3]);
    var d = new Date(Date.UTC(a, me - 1, g));
    if (a < 2000 || a > 2100 || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return null;
    return m[0];
  }
  /** Orario scritto come viene dalla tastiera: "22:00", "22.00", "22,00", "2200", "22" → "22:00"; "" se vuoto; null se non si capisce. */
  function leggiOrario(t) {
    t = String(vuoto(t) ? '' : t).trim();
    if (!t) return '';
    var m = /^(\d{1,2})(?:[:.,]?(\d{2}))?$/.exec(t);
    if (!m) return null;
    var h = Number(m[1]), mi = m[2] === undefined ? 0 : Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return ('0' + h).slice(-2) + ':' + ('0' + mi).slice(-2);
  }
  /** "Sab 12 dicembre 2026" (con breve = true: "Sab 12/12"). */
  function scriviData(data, breve) {
    var d = leggiData(data);
    if (!d) return '';
    var x = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))));
    var g = GIORNI_SETT[x.getUTCDay()];
    return breve ? g + ' ' + x.getUTCDate() + '/' + (x.getUTCMonth() + 1) : g + ' ' + x.getUTCDate() + ' ' + MESI[x.getUTCMonth()] + ' ' + x.getUTCFullYear();
  }
  /** Una serata è passata dal giorno dopo la sua data. oggi = "aaaa-mm-gg". Senza data non è né passata né prossima. */
  function serataPassata(s, oggi) { var d = leggiData(s && s.data); return !!d && d < oggi; }
  /** Serate prossime (dalla data di oggi, la più vicina prima) e passate (la più recente prima); senza data in fondo alle prossime. */
  function ordinaSerate(serate, oggi) {
    var prossime = [], passate = [], senzaData = [];
    (serate || []).forEach(function (s) {
      if (!leggiData(s.data)) senzaData.push(s); else if (s.data < oggi) passate.push(s); else prossime.push(s);
    });
    var ora_ = function (s) { return leggiOrario(s.orario) || ''; };
    prossime.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : ora_(a) < ora_(b) ? -1 : ora_(a) > ora_(b) ? 1 : 0; });
    passate.sort(function (a, b) { return a.data > b.data ? -1 : a.data < b.data ? 1 : 0; });
    return { prossime: prossime.concat(senzaData), passate: passate, prossima: prossime[0] || null };
  }

  /** Controlla una serata. Restituisce { valori, errori }. */
  function normalizzaSerata(d) {
    d = d || {};
    var v = {}, errori = [];
    v.id = d.id;
    if (!idValido(d.id)) errori.push('id');
    v.data = leggiData(d.data) || '';
    if (!v.data) errori.push('data');           // la data serve: la serata si salva appena c'è
    v.locale = testo(d.locale, MAX_LOCALE);
    v.localeId = idValido(d.localeId) ? d.localeId : '';   // v13: locale della rubrica (il nome resta in "locale")
    var o = leggiOrario(d.orario);
    if (o === null) errori.push('orario'); else v.orario = o;
    v.note = testo(d.note, MAX_NOTE_SERATA);
    return { valori: v, errori: errori };
  }

  /** Controlla una riga di scaletta. Il testo della riga libera sta in "nota". */
  function normalizzaRigaScaletta(d) {
    d = d || {};
    var v = {}, errori = [];
    v.id = d.id;
    if (!idValido(d.id)) errori.push('id');
    v.tipo = vuoto(d.tipo) ? 'brano' : String(d.tipo);
    if (TIPI_RIGA.indexOf(v.tipo) < 0) { errori.push('tipo'); return { valori: v, errori: errori }; }
    v.brano = ''; v.minuti = ''; v.nota = '';
    if (v.tipo === 'brano') {
      v.brano = d.brano;
      if (!idValido(d.brano)) errori.push('brano');
      v.nota = testo(d.nota, MAX_NOTA_RIGA);
    } else if (v.tipo === 'pausa') {
      var p = interoFacoltativo(d.minuti, PAUSA_MIN, PAUSA_MAX);
      if (p === null || p === '') errori.push('minuti'); else v.minuti = p;
    } else if (v.tipo === 'libera') {
      v.nota = testo(d.nota, MAX_LIBERA);
      if (!v.nota) errori.push('nota');
      var l = interoFacoltativo(d.minuti, 0, MAX_MINUTI_LIBERA);
      if (l === null) errori.push('minuti'); else v.minuti = l === 0 ? '' : l;
    }
    return { valori: v, errori: errori };
  }

  /** Scaletta intera nell'ordine voluto: { valori (con ordine 1…n), errori = [{ indice, campi }] (indice −1 = la scaletta in sé) }. */
  function normalizzaScaletta(lista) {
    if (!lista || typeof lista.length !== 'number' || typeof lista === 'string') return { valori: [], errori: [{ indice: -1, campi: ['scaletta'] }] };
    if (lista.length > MAX_SCALETTA) return { valori: [], errori: [{ indice: -1, campi: ['troppe'] }] };
    var valori = [], errori = [], visti = {}, bis = -1;
    for (var i = 0; i < lista.length; i++) {
      var n = normalizzaRigaScaletta(lista[i]);
      if (n.valori.id && visti[n.valori.id]) n.errori.push('doppione');
      visti[n.valori.id] = true;
      if (n.valori.tipo === 'bis') { if (bis >= 0) n.errori.push('secondoBis'); else bis = i; }
      if (n.valori.tipo === 'pausa' && bis >= 0) n.errori.push('pausaDopoBis');
      if (n.errori.length) errori.push({ indice: i, campi: n.errori });
      n.valori.ordine = i + 1;
      valori.push(n.valori);
    }
    return { valori: valori, errori: errori };
  }

  /** Solo i brani, nell'ordine della scaletta (serve alla T8). */
  function braniInOrdine(righe) {
    return (righe || []).filter(function (r) { return (r.tipo || 'brano') === 'brano' && r.brano; }).map(function (r) { return r.brano; });
  }
  /** Brani che compaiono più di una volta: { idBrano: volte }. */
  function doppioniScaletta(righe) {
    var c = {}, out = {};
    braniInOrdine(righe).forEach(function (b) { c[b] = (c[b] || 0) + 1; });
    for (var k in c) if (c[k] > 1) out[k] = c[k];
    return out;
  }

  /** "hh:mm" + minuti → "hh:mm" (oltre la mezzanotte si riparte da 00:00). */
  function sommaOrario(hhmm, minuti) {
    var o = leggiOrario(hhmm);
    if (!o) return '';
    var t = (((Number(o.slice(0, 2)) * 60 + Number(o.slice(3, 5)) + Math.round(minuti)) % 1440) + 1440) % 1440;
    return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2);
  }

  /**
   * Riepilogo della scaletta: set (divisi dalle pause), bis, totale e orari previsti.
   * righe: nell'ordine; brani e sezioni: quelli del repertorio; orario: "hh:mm" o ''.
   * Ogni set: { numero, righe: [indici], brani, secondi, minutiExtra, mancanti: [titoli], pausaDopo, inizio, fine }.
   * Il bis: stessa forma con bis: true (null se non c'è). per riga: [{ tipo, numero (solo brani), set, inBis }].
   * (non ovvio) secondi = solo i brani con durata; i mancanti si elencano e il set diventa "almeno".
   * Gli orari usano i secondi + i minuti delle righe libere + le pause, arrotondati al minuto solo alla fine.
   */
  function riepilogoScaletta(righe, brani, sezioni, orario) {
    righe = righe || [];
    var perId = {}, sezPer = {};
    (brani || []).forEach(function (b) { perId[b.id] = b; });
    (sezioni || []).forEach(function (s) { (sezPer[s.brano] = sezPer[s.brano] || []).push(s); });
    var nuovo = function (n, bis) { return { numero: n, bis: !!bis, righe: [], brani: 0, secondi: 0, minutiExtra: 0, mancanti: [], pausaDopo: 0, inizio: '', fine: '' }; };
    var sets = [nuovo(1)], bis = null, corrente = sets[0], perRiga = [], numero = 0;
    righe.forEach(function (r, i) {
      var tipo = r.tipo || 'brano';
      if (tipo === 'pausa') {
        if (bis) { perRiga.push({ tipo: tipo, set: corrente.numero, inBis: true }); return; }   // (solo da un'unione) non spezza il bis
        corrente.pausaDopo = Number(r.minuti) || 0;
        perRiga.push({ tipo: tipo, set: corrente.numero, inBis: false });
        corrente = nuovo(sets.length + 1); sets.push(corrente);
        return;
      }
      if (tipo === 'bis') {
        if (!bis) { bis = nuovo(0, true); corrente = bis; }
        perRiga.push({ tipo: tipo, set: 0, inBis: true });
        return;
      }
      corrente.righe.push(i);
      if (tipo === 'libera') {
        corrente.minutiExtra += Number(r.minuti) || 0;
        perRiga.push({ tipo: tipo, set: corrente.numero, inBis: !!bis });
        return;
      }
      numero++;
      corrente.brani++;
      perRiga.push({ tipo: 'brano', numero: numero, set: corrente.numero, inBis: !!bis });
      var b = perId[r.brano];
      var d = b ? durataEffettiva(b, sezPer[r.brano] || []) : { secondi: null };
      if (d.secondi === null) corrente.mancanti.push(b ? String(b.titolo) : '(brano tolto)'); else corrente.secondi += d.secondi;
    });
    // l'ultimo set vuoto dopo una pausa finale non si mostra (la pausa resta, il set no)
    if (sets.length > 1 && !sets[sets.length - 1].righe.length) sets.pop();
    var tutte = sets.concat(bis ? [bis] : []);
    var tot = { secondi: 0, minutiExtra: 0, mancanti: [], brani: 0 };
    tutte.forEach(function (s) { tot.secondi += s.secondi; tot.minutiExtra += s.minutiExtra; tot.brani += s.brani; tot.mancanti = tot.mancanti.concat(s.mancanti); });
    var o = leggiOrario(orario);
    if (o) {
      var minuti = 0;   // dall'inizio della serata, non arrotondati
      tutte.forEach(function (s) {
        s.inizio = sommaOrario(o, minuti);
        minuti += s.secondi / 60 + s.minutiExtra;
        s.fine = sommaOrario(o, minuti);
        minuti += s.pausaDopo;
      });
    }
    return { sets: sets, bis: bis, totale: tot, perRiga: perRiga, doppioni: doppioniScaletta(righe), conOrari: !!o };
  }

  /** Durata di un set già scritta: "42:10", "42:10 + 5 min", "almeno 38:40"; '' se non c'è niente. */
  function scriviDurataSet(s) {
    var base = s.secondi > 0 ? (s.secondi >= 3600 ? Math.floor(s.secondi / 3600) + ':' + ('0' + Math.floor((s.secondi % 3600) / 60)).slice(-2) + ':' + ('0' + (s.secondi % 60)).slice(-2) : scriviDurata(s.secondi)) : (s.mancanti.length ? '0:00' : '');
    if (base && s.mancanti.length) base = 'almeno ' + base;
    if (s.minutiExtra) base = (base ? base + ' + ' : '') + s.minutiExtra + ' min';
    return base;
  }

  /** Simbolo della nota del BPM per la stampa ('' per i quarti: il caso normale non si scrive). */
  var NOTA_STAMPA = { 'Quarti': '', 'Ottavi': '♪', 'Quarti puntati': '♩.', 'Minime': 'minima' };
  /**
   * Una riga del foglio stampato: { titolo, tonalita, bpm, accordatura }.
   * Accordatura solo quando cambia rispetto al brano prima; sul primo brano solo se non è Mib (e non è vuota).
   */
  function rigaStampa(brano, precedente, notazione) {
    brano = brano || {};
    var t = tonalitaBrano(brano, notazione, false);
    var bpm = vuoto(brano.bpm) ? '' : String(brano.bpm);
    var nota = NOTA_STAMPA[brano.riferimento || 'Quarti'];
    if (bpm && nota) bpm = nota + ' ' + bpm;
    var acc = String(brano.accordatura || '');
    var mostra = precedente ? acc !== String(precedente.accordatura || '') : (acc !== '' && acc !== 'Mib');
    return { titolo: String(brano.titolo || '(brano tolto)').toUpperCase(), tonalita: t.suonata ? t.testo : '', bpm: bpm, accordatura: mostra ? (acc || 'accordatura ?') : '' };
  }

  /* ================= T8 · Modalità Palco e file per la serata =================
   * Il piano del palco si ricava dal piano del metronomo (T6): stessi tratti, quindi lo stesso tempo del click.
   * I secondi sono a tempo 100; con un rallentamento si moltiplicano per 100 / tempo (lo fa sezioneAlTempo).
   * Decisione D2 (15/11/2026): "poi: …" nell'ultima battuta della sezione, ma per almeno 2 secondi.
   */
  var POI_MIN_SECONDI = 2;
  var CARATTERI_PALCO = { 'Grandi': 26, 'Molto grandi': 34, 'Enormi': 44 };   // px del testo della sezione corrente a 390 px

  /**
   * Righe della scaletta per il palco: un elemento per brano, con la sua nota di riga e cosa viene dopo (pausa, riga libera, bis).
   * esiste(id), se c'è, salta i brani tolti dal repertorio: ciò che veniva dopo passa al brano precedente.
   */
  function vociPalco(righe, esiste) {
    var out = [], prima = [];
    (righe || []).forEach(function (r) {
      var tipo = r.tipo || 'brano';
      if (tipo === 'brano') {
        if (!r.brano || (esiste && !esiste(r.brano))) return;
        out.push({ brano: r.brano, nota: String(r.nota || ''), prima: prima, dopo: [] }); prima = []; return;
      }
      var x = { tipo: tipo, testo: tipo === 'pausa' ? 'PAUSA' : tipo === 'bis' ? 'BIS' : String(r.nota || ''), minuti: vuoto(r.minuti) ? '' : Number(r.minuti) };
      if (out.length) out[out.length - 1].dopo.push(x); else prima.push(x);
    });
    return out;
  }
  /** "PAUSA 15 min", "› Sindaco che parla 5 min", "BIS". */
  function scriviRigaSpeciale(x) {
    if (x.tipo === 'bis') return 'BIS';
    var t = x.tipo === 'pausa' ? 'PAUSA' : '› ' + x.testo;
    return t + (x.minuti ? ' ' + x.minuti + ' min' : '');
  }

  /**
   * Piano del palco: { modo: 'struttura' | 'mano', motivo, conteggio (s), sezioni: [{ sezione, nome, inizio, fine, secBattuta, battute, battutePoi, inizioPoi }], durata }.
   * Con "mano" (struttura incompleta, senza BPM) la sezione si sposta solo a mano, e il motivo lo dice.
   * opzioni: come il metronomo ({ daSezione, conteggio }).
   */
  /**
   * (collaudo T8) Il motivo del palco "a mano" sta in una riga: mai valori grezzi, al massimo 3 nomi.
   * "mancano le battute in Solo, Finale" · "mancano le battute in 5 sezioni" · "metro non riconosciuto in tutte le sezioni".
   */
  function motivoBreve(x) {
    var n = x.sezioni.length;
    var dove = n >= x.totale && n > 1 ? 'tutte le sezioni' : n > 3 ? n + ' sezioni' : x.sezioni.join(', ');
    return x.cosa + ' in ' + dove;
  }
  function pianoPalco(brano, sezioni, opzioni) {
    var p = pianoMetronomo(brano, sezioni, opzioni || {});
    if (p.modo !== 'struttura') {
      var motivo = p.modo === 'nessuno' ? 'scrivi il BPM del brano' : p.mancanza ? motivoBreve(p.mancanza) : String(p.motivo || '').replace(/^libero: /, '');
      return { modo: 'mano', motivo: 'scorrimento a mano' + (motivo ? ': ' + motivo : ''), conteggio: 0, sezioni: [], durata: null };
    }
    var t = 0, cont = 0, out = [];
    p.tratti.forEach(function (tr) {
      var sb = tr.battitiBattuta * 60 / tr.bpm, n = tr.battute * tr.giri, dur = n * sb;
      if (tr.conteggio) { cont += dur; t += dur; return; }
      var nPoi = Math.min(n, Math.max(1, Math.ceil(POI_MIN_SECONDI / sb - 1e-9)));
      out.push({ sezione: tr.sezione, nome: tr.nome, inizio: t, fine: t + dur, secBattuta: sb, battute: n, battutePoi: nPoi, inizioPoi: t + dur - nPoi * sb, battitiBattuta: tr.battitiBattuta });
      t += dur;
    });
    return { modo: 'struttura', motivo: '', conteggio: cont, sezioni: out, durata: t - cont };
  }

  /**
   * Dove si è dopo "secondi" dallo start (conteggio compreso), con il rallentamento "tempo" (100 = scritto).
   * { stato: 'attesa' | 'conteggio' | 'sezione' | 'fine', indice, sezione, battuta, poi }. Serve anche alla T8-sync.
   */
  function sezioneAlTempo(piano, secondi, tempo) {
    if (!piano || piano.modo !== 'struttura' || !piano.sezioni.length) return null;
    var s = Number(secondi) * (Number(tempo) || 100) / 100, E = 1e-9, ss = piano.sezioni, ultima = ss.length - 1;
    var base = function (i) { return { indice: i, sezione: ss[i].sezione, nome: ss[i].nome, battuta: 0, poi: false }; };
    var o;
    if (s < 0) { o = base(0); o.stato = 'attesa'; return o; }
    if (s < piano.conteggio - E) { o = base(0); o.stato = 'conteggio'; return o; }
    if (s >= ss[ultima].fine - E) { o = base(ultima); o.stato = 'fine'; return o; }
    for (var i = 0; i <= ultima; i++) {
      if (s < ss[i].fine - E) {
        o = base(i); o.stato = 'sezione';
        o.battuta = Math.min(ss[i].battute, Math.floor((s - ss[i].inizio) / ss[i].secBattuta + E) + 1);
        o.poi = i < ultima && s >= ss[i].inizioPoi - E;
        return o;
      }
    }
    o = base(ultima); o.stato = 'fine'; return o;
  }

  /* ---------- T8-sync · palco sincronizzato (decisioni D1–D6 del 16/11/2026) ---------- */
  var EVENTI_SYNC = ['diretta', 'start', 'pronto', 'fermo', 'fine'];
  var SYNC_SCADENZA_MS = 3 * 3600 * 1000;   // una diretta senza messaggi da 3 ore (telefono spento a metà) non vale più
  var reIdSync = /^[A-Za-z0-9_-]{1,40}$/;
  function interoTra(x, a, b) { return typeof x === 'number' && Math.floor(x) === x && x >= a && x <= b; }
  function numeroFinito(x) { return typeof x === 'number' && isFinite(x); }

  /**
   * Istante (orologio del server, ms) della PRIMA BATTUTA dopo il conteggio: chi riceve non deve sapere quante
   * battute di conteggio usa la batteria. oraPartenzaServer = istante del primo colpo del conteggio.
   */
  function inizioSync(oraPartenzaServer, piano, tempo) {
    var t = Number(tempo) || 100;
    return Math.round(Number(oraPartenzaServer) + ((piano && piano.conteggio) || 0) * 100 / t * 1000);
  }

  /** Costruisce il messaggio della batteria. dati: { n, evento, serata, brano, voce, daSezione, inizio, tempo, inviato }. */
  function messaggioPalco(dati) {
    var d = dati || {}, ev = d.evento;
    var m = { n: d.n, evento: ev, diretta: ev !== 'fine', serata: String(d.serata || ''), brano: String(d.brano || ''),
      voce: vuoto(d.voce) ? 0 : Number(d.voce), daSezione: String(d.daSezione || ''),
      inizio: ev === 'start' ? Math.round(Number(d.inizio)) : 0, tempo: vuoto(d.tempo) ? 100 : Number(d.tempo), inviato: Math.round(Number(d.inviato)) };
    return messaggioValido(m) ? m : null;
  }

  /** Stessi controlli delle regole del database (regole-firebase.json): campi, tipi e grandezze. */
  function messaggioValido(m) {
    if (!m || typeof m !== 'object') return false;
    var chiavi = Object.keys(m).filter(function (k) { return k !== 'scritto'; }).sort().join();
    if (chiavi !== 'brano,daSezione,diretta,evento,inizio,inviato,n,serata,tempo,voce') return false;
    if (!interoTra(m.n, 1, 1e9) || EVENTI_SYNC.indexOf(m.evento) < 0 || m.diretta !== (m.evento !== 'fine')) return false;
    if (!reIdSync.test(m.serata)) return false;
    if (m.brano !== '' && !reIdSync.test(m.brano)) return false;
    if (m.daSezione !== '' && !reIdSync.test(m.daSezione)) return false;
    if (!interoTra(m.voce, 0, 199) || !interoTra(m.tempo, 50, 100) || !numeroFinito(m.inviato) || !numeroFinito(m.inizio)) return false;
    if ((m.evento === 'start' || m.evento === 'pronto') && m.brano === '') return false;
    if (m.evento === 'start' && !(m.inizio > 0)) return false;
    return true;
  }

  /**
   * Il messaggio riguarda il palco aperto su questo telefono? (D6: solo il palco di una serata, la stessa.)
   * contesto: { serata (id o '' per il palco di un brano), oraServer (ms) }.
   * → { vale, motivo: 'valido' | 'non valido' | 'brano singolo' | 'altra serata' | 'scaduto' | 'fine' }
   */
  function leggiMessaggio(m, contesto) {
    var c = contesto || {};
    if (!messaggioValido(m)) return { vale: false, motivo: 'non valido' };
    if (!c.serata) return { vale: false, motivo: 'brano singolo' };
    if (m.serata !== c.serata) return { vale: false, motivo: 'altra serata' };
    if (numeroFinito(c.oraServer) && c.oraServer - m.inviato > SYNC_SCADENZA_MS) return { vale: false, motivo: 'scaduto' };
    if (!m.diretta) return { vale: false, motivo: 'fine' };
    return { vale: true, motivo: 'valido' };
  }

  /**
   * Cosa mostra un telefono che NON è la batteria. Ognuno calcola da solo, con il proprio orologio corretto sul server.
   * m = ultimo messaggio; piano = pianoPalco del brano m.brano con daSezione = m.daSezione (il conteggio del telefono
   * non conta: si toglie); stato = { serata, oraServer, segue, staccato, collegato }.
   * → { stato, indice, battuta, poi, mancano, brano, voce }:
   *   'indipendente' (nessuna diretta: palco come nella T8) · 'avviso' (diretta, non segue: "Segui") ·
   *   'staccato' (D3: corretto a mano, "↺ segui") · 'collegamento' (in attesa del server: niente copia vecchia) ·
   *   'pronto' (brano scelto, aspetta lo start) · 'fermo' (click fermato: si resta dove si era, a mano) ·
   *   'mano' (brano senza struttura completa) · 'conteggio' (mancano N battiti) · 'sezione' · 'fine'.
   */
  function vistaSync(m, piano, stato) {
    var st = stato || {}, out = { stato: 'indipendente', indice: -1, battuta: 0, poi: false, mancano: 0, brano: '', voce: -1 };
    var l = leggiMessaggio(m, st);
    if (!l.vale) return out;
    if (!st.segue) { out.stato = 'avviso'; return out; }
    out.brano = m.brano; out.voce = m.voce;
    if (st.staccato) { out.stato = 'staccato'; return out; }
    if (!st.collegato) { out.stato = 'collegamento'; return out; }
    if (m.evento === 'diretta') { out.stato = m.brano ? 'pronto' : 'fermo'; return out; }
    if (m.evento === 'pronto') { out.stato = 'pronto'; return out; }
    if (m.evento === 'fermo') { out.stato = 'fermo'; return out; }
    if (!piano || piano.modo !== 'struttura' || !piano.sezioni.length) { out.stato = 'mano'; return out; }
    var t = (m.tempo || 100), dt = (st.oraServer - m.inizio) / 1000;   // secondi reali dalla prima battuta
    if (dt < 0) {
      var s0 = piano.sezioni[0], battito = s0.secBattuta / (s0.battitiBattuta || 1) * 100 / t;
      out.stato = 'conteggio'; out.indice = 0; out.mancano = Math.ceil(-dt / battito - 1e-9); return out;
    }
    var r = sezioneAlTempo(piano, dt + piano.conteggio * 100 / t, t);
    out.indice = r.indice; out.battuta = r.battuta; out.poi = r.poi;
    out.stato = r.stato === 'fine' ? 'fine' : 'sezione';
    return out;
  }

  /** Nome del file (e del PDF): "2026-12-12 Bar Test - Palco Dish for a King"; caratteri vietati nei nomi dei file tolti. */
  function nomeFileSerata(serata, cosa) {
    var locale = String((serata && serata.locale) || '').replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    return [(serata && serata.data) || '', locale].filter(function (x) { return x; }).join(' ') + ' - ' + cosa + ' Dish for a King';
  }

  function html(t) {
    return String(vuoto(t) ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /** Eccezioni di chi suona per la vista: con "evidenzia solo me" le mie in rilievo e quelle degli altri attenuate. */
  function eccezioniHtml(chiSuona, sigla, soloMe) {
    var g = gruppiChiSuona(chiSuona), out = [];
    var una = function (sg, tipo) {
      var cl = 'eccez ' + tipo + (soloMe ? (sg === sigla ? ' mia' : ' altri') : '');
      out.push('<span class="' + cl + '">' + (tipo === 'tacet' ? 'tacet ' : '★ ') + html(sg) + '</span>');
    };
    g.tacet.forEach(function (sg) { una(sg, 'tacet'); });
    g.stella.forEach(function (sg) { una(sg, 'stella'); });
    return out.join(' ');
  }

  /**
   * File "Prepara per la serata" (decisioni T8: senza JavaScript, scuro con il logo scuro, personale).
   * d = { serata, righe, brani, sezioni, testi, notazione, sigla, evidenziaSoloMe, caratteri, logo (testo SVG), generato }.
   * Restituisce il documento HTML intero.
   */
  function fileSerata(d) {
    d = d || {};
    var s = d.serata || {}, brani = d.brani || [], tutte = d.sezioni || [], testi = d.testi || [];
    var px = CARATTERI_PALCO[d.caratteri] || CARATTERI_PALCO['Molto grandi'];
    var trova = function (lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i]; return null; };
    var voci = vociPalco(d.righe, function (id) { return !!trova(brani, id); });
    var dati = [scriviData(s.data), s.locale, s.orario ? 'ore ' + s.orario : ''].filter(function (x) { return x; }).join(' · ');
    var css = 'body{margin:0;background:#0b0c10;color:#eceff4;font:' + Math.round(px * 0.62) + 'px/1.35 system-ui,-apple-system,Roboto,"Noto Sans",sans-serif}'
      + 'main{max-width:760px;margin:0 auto;padding:12px 14px 40px}a{color:#E7C846}'
      + '.logo svg{width:100%;height:auto;max-width:460px;display:block;margin:0 auto}'
      + 'h1{color:#E7C846;text-align:center;letter-spacing:4px;margin:8px 0 2px;font-size:1.3em}'
      + '.dati{text-align:center;margin:0 0 4px}.chi{text-align:center;color:#9aa3b2;font-size:.6em;margin:0 0 14px}'
      + '.scaletta ol{list-style:none;padding:0;margin:0 0 18px}.scaletta li{padding:7px 0;border-bottom:1px solid #262a35}'
      + '.scaletta a{text-decoration:none;color:#eceff4;font-weight:700}.scaletta .info{color:#9aa3b2;font-size:.75em;margin-left:6px}'
      + '.sep{color:#E7C846;font-weight:700;letter-spacing:1px}.sep.libera{color:#eceff4;font-weight:400;letter-spacing:0}'
      + '.brano{border-top:3px solid #E7C846;padding-top:10px;margin-top:26px}'
      + '.testa .n{color:#9aa3b2;font-size:.7em}.testa h2{margin:0;font-size:1.15em;letter-spacing:.5px}'
      + '.testa .info{color:#E7C846;font-weight:700;margin:2px 0}.testa .nota{color:#eceff4;font-style:italic;margin:4px 0}'
      + '.sez{background:#16181f;border:1px solid #262a35;border-radius:10px;padding:8px 12px;margin:10px 0}'
      + '.sez h3{margin:0 0 4px;font-size:.8em;color:#E7C846;text-transform:uppercase;letter-spacing:1px}'
      + '.sez .notasez{color:#9aa3b2;font-size:.75em;margin:0 0 4px}'
      + '.parole{white-space:pre-wrap;margin:0;font-size:' + Math.round(px / (px * 0.62) * 100) / 100 + 'em;line-height:1.25}'
      + '.eccez{font-size:.75em;margin-left:6px;padding:1px 6px;border-radius:6px;border:1px solid #262a35;font-weight:400;text-transform:none;letter-spacing:0;color:#eceff4}'
      + '.eccez.tacet{color:#ff8a80}.eccez.stella{color:#E7C846}.eccez.altri{opacity:.45}.eccez.mia{border-color:currentColor;font-weight:700}'
      + '.sez.mio-tacet{opacity:.55}.dopo{color:#E7C846;font-weight:700;margin:12px 0}'
      + '.vai{display:flex;justify-content:space-between;gap:12px;margin:14px 0 0;font-size:.85em}.vai a{padding:10px 0}';
    var h = ['<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + html(nomeFileSerata(s, 'Palco')) + '</title><style>' + css + '</style></head><body><main>',
      '<header id="inizio"><div class="logo">' + (d.logo || '') + '</div><h1>PALCO</h1>',
      '<p class="dati">' + html(dati) + '</p>',
      '<p class="chi">Preparato per ' + html(d.sigla || '') + (d.generato ? ' · ' + html(d.generato) : '') + ' · si apre senza rete</p></header>'];
    // scaletta con i link ai brani
    h.push('<nav class="scaletta"><ol>');
    var sep = function (x) { return '<li class="sep' + (x.tipo === 'libera' ? ' libera' : '') + '">' + html(scriviRigaSpeciale(x)) + '</li>'; };
    voci.forEach(function (v, i) {
      v.prima.forEach(function (x) { h.push(sep(x)); });
      var b = trova(brani, v.brano), rs = rigaStampa(b, i ? trova(brani, voci[i - 1].brano) : null, d.notazione);
      h.push('<li><a href="#b' + (i + 1) + '">' + (i + 1) + ' ' + html(rs.titolo) + '</a><span class="info">' + html([rs.tonalita, rs.bpm, rs.accordatura].filter(function (x) { return x; }).join(' · ')) + '</span></li>');
      v.dopo.forEach(function (x) { h.push(sep(x)); });
    });
    if (!voci.length) h.push('<li>Scaletta vuota.</li>');
    h.push('</ol></nav>');
    // i brani
    voci.forEach(function (v, i) {
      var b = trova(brani, v.brano), rs = rigaStampa(b, i ? trova(brani, voci[i - 1].brano) : null, d.notazione);
      var sez = tutte.filter(function (x) { return x.brano === v.brano; }).sort(function (a, c) { return a.ordine - c.ordine; });
      var nomi = nomiSezioni(sez);
      h.push('<section class="brano" id="b' + (i + 1) + '"><div class="testa"><span class="n">' + (i + 1) + '/' + voci.length + '</span>');
      h.push('<h2>' + html(rs.titolo) + '</h2><p class="info">' + html([rs.tonalita, rs.bpm, rs.accordatura].filter(function (x) { return x; }).join(' · ')) + '</p>');
      if (v.nota) h.push('<p class="nota">' + html(v.nota) + '</p>');
      h.push('</div>');
      if (!sez.length) h.push('<p class="chi">Struttura non ancora scritta.</p>');
      sez.forEach(function (x, k) {
        var t = trova(testi, x.testo), mia = (leggiChiSuona(x.chiSuona) || {})[d.sigla];
        h.push('<div class="sez' + (mia === 'tacet' ? ' mio-tacet' : '') + '"><h3>' + html(nomi[k] + (Number(x.ripetizioni) > 1 ? ' ×' + x.ripetizioni : '')) + ' ' + eccezioniHtml(x.chiSuona, d.sigla, !!d.evidenziaSoloMe) + '</h3>');
        if (x.nota) h.push('<p class="notasez">' + html(x.nota) + '</p>');
        if (t && t.testo) h.push('<p class="parole">' + html(t.testo) + '</p>');
        h.push('</div>');
      });
      if (v.dopo.length) h.push('<p class="dopo">dopo: ' + html(v.dopo.map(scriviRigaSpeciale).join(' · ')) + '</p>');
      var dopoB = voci[i + 1] ? trova(brani, voci[i + 1].brano) : null;
      h.push('<nav class="vai"><a href="#inizio">↑ scaletta</a>' + (dopoB ? '<a href="#b' + (i + 2) + '">brano ›› ' + (i + 2) + ' ' + html(String(dopoB.titolo || '').toUpperCase()) + '</a>' : '<span>fine della scaletta</span>') + '</nav></section>');
    });
    h.push('</main></body></html>');
    return h.join('\n');
  }

  /* ===================== T8-bis-1 (v10): scheda tecnica ===================== */
  // Famiglie e ordine come nella Scheda Gig del WING; lettera per il foglio (mai solo colore).
  var FAMIGLIE = [
    { id: 'batteria', nome: 'Batteria', lettera: 'B', colore: '#B62E27' },
    { id: 'basso', nome: 'Basso', lettera: 'Bs', colore: '#7A4FA0' },
    { id: 'chitarre', nome: 'Chitarre', lettera: 'G', colore: '#2E7D32' },
    { id: 'tastiere', nome: 'Tastiere', lettera: 'K', colore: '#00838F' },
    { id: 'fiati', nome: 'Fiati', lettera: 'F', colore: '#C77700' },
    { id: 'voci', nome: 'Voci', lettera: 'V', colore: '#29367C' },
    { id: 'basi', nome: 'Basi', lettera: 'Ba', colore: '#5D6B78' },
    { id: 'aux', nome: 'Aux', lettera: 'X', colore: '#8D6E63' }
  ];
  // Correzioni del collaudo (17/11/2026, C1): asta dritta del cantante; "alta" → dritta e "corta" → giraffa corta nelle schede vecchie
  var ASTE = ['dritta', 'giraffa', 'giraffa corta', 'clamp', 'nessuna'];
  var ASTE_VECCHIE = { alta: 'dritta', corta: 'giraffa corta' };
  var POSIZIONI_SCRITTA = ['sotto', 'sopra', 'destra', 'sinistra'];
  var FORNITO = ['band', 'locale'];
  var TIPI_MONITOR = ['wedge', 'IEM stereo', 'IEM mono'];
  // Variante del 17/11/2026 (batteria a pezzi): ogni pezzo è un'icona sua; 'batteria' (disegno fisso) resta solo per le schede vecchie.
  var PEZZI_BATTERIA = ['cassa', 'rullante', 'tom', 'timpano', 'hihat', 'ride', 'crash', 'splash', 'china', 'sgabello'];
  var ICONE_PALCO = ['ampliChitarra', 'ampliBasso', 'pedaliera', 'modeller', 'tastiera', 'astaVoce',
    'wedge', 'centralinaIem', 'di', 'presa', 'stagebox', 'rackWing', 'splitter', 'cassaPa', 'sub'].concat(PEZZI_BATTERIA).concat(['pedana', 'batteria']);
  var AGGANCIO_FINE = 0.05;   // i pezzi della batteria stanno a pochi cm l'uno dall'altro
  /* Set di Francesco (17/11/2026), posizioni in metri dal centro, per batterista DESTRO (assunzione: hi-hat alla sua sinistra,
     cioè a destra guardando dal pubblico, che sta in basso). Vale finché Francesco non salva il suo con "Salva come mio set". */
  var SET_PARTENZA = [
    { tipo: 'sgabello', x: 0, y: -0.55 }, { tipo: 'cassa', x: 0, y: 0.1 }, { tipo: 'rullante', x: 0.25, y: -0.2 },
    { tipo: 'hihat', x: 0.55, y: -0.2 }, { tipo: 'tom', x: 0.15, y: -0.05, etichetta: 'Tom1' }, { tipo: 'tom', x: -0.15, y: -0.05, etichetta: 'Tom2' },
    { tipo: 'timpano', x: -0.45, y: -0.25, etichetta: 'Ftom1' }, { tipo: 'timpano', x: -0.45, y: -0.65, etichetta: 'Ftom2' },
    { tipo: 'ride', x: -0.7, y: 0.1 }, { tipo: 'crash', x: 0.6, y: 0.25, etichetta: 'Crash1' }, { tipo: 'splash', x: 0.25, y: 0.35 },
    { tipo: 'crash', x: -0.35, y: 0.35, etichetta: 'Crash2' }, { tipo: 'china', x: -0.95, y: -0.3 }];
  var MAX_CANALI = 64, MAX_MIX = 24, MAX_ICONE = 80;
  var PALCO_MIN = 2, PALCO_MAX = 30, PASSO_PALCO = 0.5, AGGANCIO = 0.25;

  function testoBreve(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
  // (non ovvio, trovato nel collaudo 17/11) i testi lunghi tengono gli a capo: testoBreve li toglieva e l'elenco delle note finiva su una riga
  function testoLungo(v, max) { return String(v === undefined || v === null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max); }
  // id interni alla scheda (canali, mix, icone): non sono righe del foglio, basta che inizino con una lettera.
  function idInterno(id) { return typeof id === 'string' && /^[A-Za-z][A-Za-z0-9]{0,23}$/.test(id); }
  function indiceFamiglia(id) { for (var i = 0; i < FAMIGLIE.length; i++) if (FAMIGLIE[i].id === id) return i; return FAMIGLIE.length - 1; }
  function famigliaDi(id) { return FAMIGLIE[indiceFamiglia(id)]; }
  function aggancia(v, passo) { return Math.round(Number(v) / passo) * passo; }
  function limita(v, a, b) { v = Number(v); if (!isFinite(v)) v = a; return Math.min(b, Math.max(a, v)); }

  function normalizzaCanale(c) {
    c = c || {};
    var click = c.click === true;
    return {
      id: idInterno(c.id) ? c.id : '',
      sorgente: testoBreve(c.sorgente, 40),
      famiglia: click ? 'aux' : FAMIGLIE[indiceFamiglia(c.famiglia)].id,
      stereo: c.stereo === true,
      mic: testoBreve(c.mic, 40),
      asta: ASTE.indexOf(ASTE_VECCHIE[c.asta] || c.asta) >= 0 ? (ASTE_VECCHIE[c.asta] || c.asta) : 'nessuna',
      phantom: c.phantom === true,
      fornito: FORNITO.indexOf(c.fornito) >= 0 ? c.fornito : 'band',   // chi porta il microfono / la DI
      // C1: chi porta l'asta, a parte (nelle schede vecchie vale come il microfono)
      astaDa: FORNITO.indexOf(c.astaDa) >= 0 ? c.astaDa : (FORNITO.indexOf(c.fornito) >= 0 ? c.fornito : 'band'),
      note: testoBreve(c.note, 80),
      click: click,
      split: !click && c.split !== false   // T8-bis-2 (D5): in modalità 3 la riga va allo splitter; il Click mai
    };
  }
  /* Ordine: famiglie come la Scheda Gig, dentro la famiglia l'ordine scritto; il Click sempre ultimo. */
  function ordinaCanali(canali) {
    return (canali || []).map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) {
      if (a.c.click !== b.c.click) return a.c.click ? 1 : -1;
      return (indiceFamiglia(a.c.famiglia) - indiceFamiglia(b.c.famiglia)) || (a.i - b.i);
    }).map(function (x) { return x.c; });
  }
  /* Linee: mono = 1 linea, stereo = 2 (L/R) che partono da una dispari; la linea saltata è "libera". */
  function numeraLinee(canali) {
    var righe = [], n = 1;
    ordinaCanali(canali).forEach(function (c) {
      if (c.stereo && n % 2 === 0) { righe.push({ linea: n, libera: true }); n++; }
      if (c.stereo) { righe.push({ linea: n, canale: c, lato: 'L' }); righe.push({ linea: n + 1, canale: c, lato: 'R' }); n += 2; }
      else { righe.push({ linea: n, canale: c, lato: '' }); n++; }
    });
    return righe;
  }
  function etichettaLinee(canali, idCanale) {
    var l = numeraLinee(canali).filter(function (r) { return r.canale && r.canale.id === idCanale; }).map(function (r) { return r.linea; });
    return l.length ? (l.length > 1 ? l[0] + '-' + l[l.length - 1] : String(l[0])) : '';
  }
  function testoMic(m) {
    m = testoBreve(m, 40);
    if (!m) return '';
    if (/^modeller$/i.test(m)) return 'Modeller (uscita XLR, niente DI)';   // C6: confermato da Francesco, tutti in XLR
    if (/^(DI|modeller|playback|linea)$/i.test(m) || /equivalente/i.test(m)) return m;
    return m + ' o equivalente';
  }
  /* C5: il nome di una sorgente stereo senza "L+R", "L/R", "LR" in fondo (l'app aggiunge L e R da sola). */
  function nomeStereo(sorgente) { return String(sorgente || '').replace(/\s*(L\s*\+\s*R|L\s*\/\s*R|LR)\s*$/i, '').trim(); }
  function nomeLinea(sorgente, lato) {
    var n = nomeStereo(sorgente);
    return lato ? (n ? n + ' ' + lato : lato) : String(sorgente || '');
  }
  /* C2: riepilogo per il locale e per la band, contato per LINEA (una coppia stereo microfonata = 2 microfoni, 2 aste). */
  function riepilogoScheda(canali) {
    var vuoto = function () { return { mic: {}, aste: {}, di: 0, ordineMic: [], ordineAste: [] }; };
    var r = { locale: vuoto(), band: vuoto(), phantom: 0 };
    var conta = function (q, mappa, ordine, chiave) { if (!q[mappa][chiave]) { q[mappa][chiave] = 0; q[ordine].push(chiave); } q[mappa][chiave]++; };
    numeraLinee(canali).forEach(function (x) {
      if (x.libera) return;
      var c = x.canale, m = testoBreve(c.mic, 40);
      if (c.phantom) r.phantom++;
      if (m) { if (/^DI$/i.test(m)) r[c.fornito].di++; else conta(r[c.fornito], 'mic', 'ordineMic', /^modeller$/i.test(m) ? 'Modeller' : m); }
      if (c.asta !== 'nessuna') conta(r[c.astaDa], 'aste', 'ordineAste', c.asta);
    });
    var testo = function (q) {
      var parti = [];
      var mic = q.ordineMic.map(function (k) { return k + ' × ' + q.mic[k]; });
      var aste = q.ordineAste.map(function (k) { return k + ' × ' + q.aste[k]; });
      if (mic.length) parti.push({ voce: 'Microfoni e sorgenti', testo: mic.join(', ') });
      if (q.di) parti.push({ voce: 'DI', testo: String(q.di) });
      if (aste.length) parti.push({ voce: 'Aste', testo: aste.join(', ') });
      return parti;
    };
    return { locale: testo(r.locale), band: testo(r.band), phantom: r.phantom };
  }
  /* C7: testo con righe "- …" o "• …" diviso in paragrafi ed elenchi. */
  function righeTesto(t) {
    var out = [];
    String(t || '').split(/\r?\n/).forEach(function (riga) {
      var r = riga.trim(); if (!r) return;
      var m = r.match(/^[-•*]\s*(.*)$/);
      if (m) { if (!out.length || out[out.length - 1].tipo !== 'elenco') out.push({ tipo: 'elenco', voci: [] }); if (m[1]) out[out.length - 1].voci.push(m[1]); }
      else out.push({ tipo: 'paragrafo', testo: r });
    });
    return out;
  }
  function normalizzaMix(m) {
    m = m || {};
    return { id: idInterno(m.id) ? m.id : '', mix: testoBreve(m.mix, 12), chi: testoBreve(m.chi, 30),
      tipo: TIPI_MONITOR.indexOf(m.tipo) >= 0 ? m.tipo : 'wedge', posizione: testoBreve(m.posizione, 30), ascolto: testoBreve(m.ascolto, 120),
      sulleSpieLocale: m.sulleSpieLocale === true };   // T8-bis-2 (D10): in 1A il mix va su una spia del locale
  }
  function normalizzaIcona(o, palco) {
    o = o || {};
    var tipo = ICONE_PALCO.indexOf(o.tipo) >= 0 ? o.tipo : 'di';
    var pezzo = PEZZI_BATTERIA.indexOf(tipo) >= 0, passo = pezzo ? AGGANCIO_FINE : AGGANCIO;
    var tondo = function (v) { return Math.round(v * 100) / 100; };   // niente 1,1500000001 dopo l'aggancio
    var ic = { id: idInterno(o.id) ? o.id : '', tipo: tipo, x: tondo(limita(aggancia(o.x, passo), 0, palco.larghezza)),
      y: tondo(limita(aggancia(o.y, passo), 0, palco.profondita)), rot: ((Math.round(Number(o.rot) / 45) * 45) % 360 + 360) % 360 || 0,
      etichetta: testoBreve(o.etichetta, 30), canali: testoBreve(o.canali, 20) };
    if (tipo === 'presa') ic.prese = limita(Math.round(o.prese || 1), 1, 12);
    if (pezzo) ic.gruppo = 'batteria';
    if (POSIZIONI_SCRITTA.indexOf(o.scritta) > 0) ic.scritta = o.scritta;   // C3: "sotto" è il valore di partenza e non si salva
    if (tipo === 'pedana') {
      ic.larghezza = tondo(limita(aggancia(o.larghezza || 2, AGGANCIO), 0.5, 6));
      ic.profondita = tondo(limita(aggancia(o.profondita || 2, AGGANCIO), 0.5, 6));
      ic.delLocale = o.delLocale === true;
    }
    return ic;
  }
  function normalizzaScheda(s) {
    s = s || {};
    var p = s.palco || {};
    var palco = { larghezza: limita(aggancia(p.larghezza || 6, PASSO_PALCO), PALCO_MIN, PALCO_MAX),
      profondita: limita(aggancia(p.profondita || 4, PASSO_PALCO), PALCO_MIN, PALCO_MAX) };
    // la pedana va disegnata sotto tutto: si mette in testa all'elenco
    palco.icone = (p.icone || []).slice(0, MAX_ICONE).map(function (o) { return normalizzaIcona(o, palco); })
      .sort(function (a, b) { return (a.tipo === 'pedana' ? 0 : 1) - (b.tipo === 'pedana' ? 0 : 1); });
    var canali = (s.canali || []).slice(0, MAX_CANALI).map(normalizzaCanale);
    return {
      canali: ordinaCanali(canali),
      monitor: (s.monitor || []).slice(0, MAX_MIX).map(normalizzaMix),
      backline: { porta: testoLungo((s.backline || {}).porta, 600), chiede: testoLungo((s.backline || {}).chiede, 600) },
      prese: testoLungo(s.prese, 400),
      orari: { carico: leggiOrario((s.orari || {}).carico) || '', soundcheck: leggiOrario((s.orari || {}).soundcheck) || '' },
      palco: palco,
      note: testoLungo(s.note, 1000),
      ospitalita: testoLungo(s.ospitalita, 1000),   // C7: camerino e ospitalità, separati dalle note tecniche
      // T8-bis-2: modalità di collegamento e copia dei dati tecnici del locale (solo nelle serate; vuoti = foglio come prima)
      collegamento: COLLEGAMENTI.some(function (x) { return x.id === s.collegamento; }) ? s.collegamento : '',
      locale: s.locale ? normalizzaDatiLocale(s.locale) : null
    };
  }
  /* Referente tecnico (uno solo, scritto dall'ADMIN): nome e telefono toccabile sul foglio. */
  function normalizzaReferente(x) {
    x = x || {};
    // mioSet (variante batteria): pezzi con posizione relativa al centro del set, in metri (da -3 a +3)
    var set = (x.mioSet || []).slice(0, 30).filter(function (o) { return o && PEZZI_BATTERIA.indexOf(o.tipo) >= 0; }).map(function (o) {
      return { tipo: o.tipo, x: Math.round(limita(o.x, -3, 3) * 100) / 100, y: Math.round(limita(o.y, -3, 3) * 100) / 100,
        rot: ((Math.round(Number(o.rot) / 45) * 45) % 360 + 360) % 360 || 0, etichetta: testoBreve(o.etichetta, 30), canali: testoBreve(o.canali, 20) };
    });
    return { nome: testoBreve(x.nome, 40), telefono: testoBreve(x.telefono, 20).replace(/[^0-9+ ]/g, ''), mioSet: set };
  }
  /* Revisioni: {rev, data, inviata}. Una modifica dopo un invio apre la Rev successiva. */
  function revisioneDopoModifica(r, oggi) {
    r = r || {};
    var n = Math.max(1, Math.round(Number(r.rev) || 1));
    if (r.inviata) return { rev: n + 1, data: oggi, inviata: false };
    return { rev: n, data: r.data || oggi, inviata: false };
  }
  function pieDiPagina(r) {
    var n = Math.max(1, Math.round(Number(r && r.rev) || 1));
    var d = r && r.data ? String(r.data).split('-').reverse().join('/') : '';
    return 'Rev. ' + n + (d ? ' · ' + d : '') + (n > 1 ? ' · sostituisce la Rev. ' + (n - 1) : '');
  }

  /* ===================== T8-bis-2 (v12): locali e collegamento (progetto approvato il 18/11/2026) ===================== */
  // D2: mixer di sala nella rubrica e modalità suggerita (la 4 non si suggerisce mai: dipende dall'accordo)
  var MIXER_LOCALE = [
    { id: 'wing', nome: 'WING / WING Compact / WING Rack', modalita: '2' },
    { id: 'x32', nome: 'Behringer X32 (tutti)', modalita: '2' },
    { id: 'm32', nome: 'Midas M32 / M32R', modalita: '2' },
    { id: 'm32c', nome: 'Midas M32C / Behringer X32 Core', modalita: '2', avviso: 'Verifica le porte AES50: su M32C e X32 Core non è sicuro che ci siano.' },
    { id: 'midasPro', nome: 'Midas PRO / Heritage-D HD96', modalita: '3', avviso: 'AES50 a 96 kHz: probabilmente non si collega al WING (48 kHz).' },
    { id: 'xr18', nome: 'Behringer XR18', modalita: '3' },
    { id: 'mr18', nome: 'Midas MR18', modalita: '3' },
    { id: 'yamaha', nome: 'Yamaha', modalita: '3' },
    { id: 'ah', nome: 'Allen & Heath', modalita: '3' },
    { id: 'soundcraft', nome: 'Soundcraft', modalita: '3' },
    { id: 'digico', nome: 'DiGiCo', modalita: '3' },
    { id: 'analogico', nome: 'Analogico (qualsiasi)', modalita: '1A-mixer' },
    { id: 'altroDigitale', nome: 'Altro digitale', modalita: '3' },
    { id: 'nonSo', nome: 'Non lo so ancora', modalita: '' },
    { id: 'nessuno', nome: 'Nessun mixer', modalita: '' }
  ];
  var COLLEGAMENTI = [
    { id: '1A-mixer', nome: '1A · Solo WING, nei canali del mixer del locale', foglio: 'Mixer della band nei canali del vostro mixer' },
    { id: '1A-impianto', nome: '1A · Solo WING, direttamente sull\'impianto del locale', foglio: 'Mixer della band sul vostro impianto' },
    { id: '1B', nome: '1B · WING e impianto nostro', foglio: 'Impianto e mixer della band' },
    { id: '2', nome: '2 · Monitor noi + FOH del locale via AES50', foglio: 'Monitor della band, mixer di sala del locale collegato via AES50' },
    { id: '3', nome: '3 · Monitor noi + FOH del locale con split analogico', foglio: 'Monitor della band, mixer di sala del locale con split analogico' },
    { id: '4', nome: '4 · Service del locale', foglio: 'Service del locale' }
  ];
  var SI_NO = ['si', 'no', 'nonSo'];
  var RUOLI_CONTATTO = ['tecnico', 'gestore', 'altro'];
  var MAX_CONTATTI = 3, USCITE_WING = 16;   // WING Rack 8 XLR + S16 8 (doc FOH)
  var FAMIGLIE_X32 = ['x32', 'm32', 'm32c'];
  function numeroONull(v, min, max, passo) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    var n = Number(String(v).replace(',', '.'));
    if (!isFinite(n)) return null;
    if (passo) n = Math.round(n / passo) * passo;
    return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  }
  function trovaMixer(id) { for (var i = 0; i < MIXER_LOCALE.length; i++) if (MIXER_LOCALE[i].id === id) return MIXER_LOCALE[i]; return null; }
  function normalizzaContatto(c) {
    c = c || {};
    var tel = testoBreve(c.telefono, 20).replace(/[^0-9+ ]/g, '').trim();
    return { nome: testoBreve(c.nome, 40), ruolo: RUOLI_CONTATTO.indexOf(c.ruolo) >= 0 ? c.ruolo : 'altro',
      telefono: /\d/.test(tel) ? tel : '', tiene: SIGLE.indexOf(c.tiene) >= 0 ? c.tiene : '' };
  }
  /** Dati tecnici del locale: sono quelli che si copiano nella scheda della serata (D1: i contatti no). */
  function normalizzaDatiLocale(l) {
    l = l || {};
    return { id: idValido(l.id) ? l.id : '', nome: testoBreve(l.nome, 40), citta: testoBreve(l.citta, 40),
      mixer: trovaMixer(l.mixer) ? l.mixer : '', distanza: numeroONull(l.distanza, 0, 300),
      palcoL: numeroONull(l.palcoL, PALCO_MIN, PALCO_MAX, PASSO_PALCO), palcoP: numeroONull(l.palcoP, PALCO_MIN, PALCO_MAX, PASSO_PALCO),
      impianto: SI_NO.indexOf(l.impianto) >= 0 ? l.impianto : '', impiantoNote: testoLungo(l.impiantoNote, 200),
      subAux: SI_NO.indexOf(l.subAux) >= 0 ? l.subAux : '', spieCablate: numeroONull(l.spieCablate, 0, 16, 1), canaliLiberi: numeroONull(l.canaliLiberi, 0, 64, 1) };
  }
  /** Riga della rubrica: dati tecnici + fino a 3 contatti ("lo tiene" = sigla del membro) + note. */
  function normalizzaLocale(l) {
    l = l || {};
    var d = normalizzaDatiLocale(l);
    d.contatti = (l.contatti || []).slice(0, MAX_CONTATTI).map(normalizzaContatto).filter(function (c) { return c.nome || c.telefono; });
    d.note = testoLungo(l.note, 600);
    return d;
  }
  /** D2/D10: modalità suggerita dal mixer di sala (e dall'impianto se non c'è mixer). */
  function suggerisciModalita(dl) {
    dl = dl || {};
    var m = trovaMixer(dl.mixer);
    if (!m || m.id === 'nonSo') return { modalita: '', primaDomanda: true };
    if (m.id === 'nessuno') return { modalita: dl.impianto === 'si' ? '1A-impianto' : dl.impianto === 'no' ? '1B' : '' };
    return m.avviso ? { modalita: m.modalita, avviso: m.avviso } : { modalita: m.modalita };
  }
  function fornitoModalita(mod) { return !mod ? null : mod === '4' ? 'locale' : 'band'; }
  // D6: le righe che di solito cambiano con la modalità (escluse quelle che porta sempre la band: Click, modeller, basi)
  function rigaFornibile(c) { return !c.click && !/^(modeller|playback)$/i.test(c.mic) && c.famiglia !== 'basi' && (!!c.mic || c.asta !== 'nessuna'); }
  function righeFornito(canali, mod) {
    var atteso = fornitoModalita(mod);
    if (!atteso) return { atteso: null, diversi: 0 };
    var n = 0;
    (canali || []).forEach(function (c) { if (rigaFornibile(c) && ((c.mic && c.fornito !== atteso) || (c.asta !== 'nessuna' && c.astaDa !== atteso))) n++; });
    return { atteso: atteso, diversi: n };
  }
  function applicaFornito(canali, mod) {
    var atteso = fornitoModalita(mod);
    return (canali || []).map(function (c) {
      if (!atteso || !rigaFornibile(c)) return c;
      var y = JSON.parse(JSON.stringify(c));
      if (y.mic) y.fornito = atteso;
      if (y.asta !== 'nessuna') y.astaDa = atteso;
      return y;
    });
  }
  /* ---------- v13 - Variante "Locale e setup nella serata" ---------- */
  function chiaveNome(t) { return String(t === null || t === undefined ? '' : t).trim().replace(/\s+/g, ' ').toLowerCase(); }
  function perNome_(a, b) { return String(a.nome).localeCompare(String(b.nome), 'it', { sensitivity: 'base' }); }
  /** Suggerimenti mentre si scrive il locale: prima chi inizia col testo, poi chi lo contiene (o ha la città che inizia così). Al massimo 6. */
  function cercaLocali(t, locali) {
    var q = chiaveNome(t), tutti = (locali || []).slice();
    if (!q) return tutti.sort(perNome_).slice(0, 6);
    var primi = [], altri = [];
    tutti.forEach(function (l) {
      var n = chiaveNome(l.nome), c = chiaveNome(l.citta);
      if (n.indexOf(q) === 0) primi.push(l);
      else if (n.indexOf(q) >= 0 || (c && c.indexOf(q) === 0)) altri.push(l);
    });
    return primi.sort(perNome_).concat(altri.sort(perNome_)).slice(0, 6);
  }
  /** Locale con lo stesso nome (maiuscole e spazi non contano): serve a collegare le serate vecchie. */
  function localePerNome(nome, locali) {
    var q = chiaveNome(nome);
    if (!q) return null;
    for (var i = 0; i < (locali || []).length; i++) if (chiaveNome(locali[i].nome) === q) return locali[i];
    return null;
  }
  /** Scheda con i dati del locale copiati e, se non è già scelto, il collegamento consigliato dal mixer. */
  function schedaConLocale(contenuto, locale) {
    var c = normalizzaScheda(contenuto || {});
    c.locale = normalizzaDatiLocale(locale || {});
    if (!c.collegamento) c.collegamento = suggerisciModalita(c.locale).modalita || '';
    return c;
  }
  var TESTI_DA_COLLEGARE = { localeManca: 'manca il locale', localeSparito: 'il locale non è più in rubrica', setup: 'manca il setup',
    localeCambiato: 'il locale della serata è cambiato: aggiorna la scheda tecnica' };
  /** Bacheca ADMIN: serate da oggi in poi con locale fuori rubrica, senza scheda tecnica o con il locale cambiato. */
  function serateDaCollegare(serate, schede, locali, oggi) {
    var perId = {}, schedaDi = {};
    (locali || []).forEach(function (l) { perId[l.id] = l; });
    (schede || []).forEach(function (k) { if (k && k.tipo === 'serata') schedaDi[k.proprietario] = k; });
    var out = [];
    (serate || []).forEach(function (s) {
      if (!s || !s.data || s.data < oggi) return;
      var codici = [], problemi = [];
      var aggiungi = function (c, t) { codici.push(c); problemi.push(t || TESTI_DA_COLLEGARE[c]); };
      if (s.localeId && !perId[s.localeId]) aggiungi('localeSparito');
      else if (!s.localeId) { if (chiaveNome(s.locale)) aggiungi('localeFuori', 'locale non in rubrica ("' + s.locale + '")'); else aggiungi('localeManca'); }
      var k = schedaDi[s.id];
      if (!k) aggiungi('setup');
      else if (k.contenuto && s.localeId && perId[s.localeId] && ((k.contenuto.locale || {}).id || '') !== s.localeId) aggiungi('localeCambiato');
      if (codici.length) out.push({ id: s.id, data: s.data, locale: s.locale || '', codici: codici, problemi: problemi });
    });
    out.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    return out;
  }

  /** AES50: le uscite vanno in fila, quindi N = ultima linea prima del Click (le libere in mezzo contano). */
  function lineeAes50(canali) {
    var n = 0;
    numeraLinee(canali).forEach(function (r) { if (!(r.canale && r.canale.click)) n = Math.max(n, r.linea); });
    return n;
  }
  function lineeDaSplittare(canali) {
    return numeraLinee(canali).filter(function (r) { return r.canale && !r.canale.click && r.canale.split !== false; }).map(function (r) { return r.linea; });
  }
  function lineeTutte(canali) { return numeraLinee(canali).filter(function (r) { return !r.libera; }).length; }
  function canaliWing(canali) { return (canali || []).length; }   // sul WING una sorgente stereo è un canale solo
  /** 1A: canali che ci servono sul loro mixer e uscite del WING che usiamo. */
  function conti1A(c) {
    var sub = c.locale && c.locale.subAux === 'no' ? 0 : 1, spie = 0, nostre = 0;
    (c.monitor || []).forEach(function (m) { if (m.sulleSpieLocale) spie++; else nostre += m.tipo === 'IEM stereo' ? 2 : 1; });
    return { sub: sub, spie: spie, canali: 2 + sub + spie, uscite: 2 + sub + spie + nostre };
  }
  /** D8: controlli che si vedono solo nella scheda. livello "avviso" o "info". */
  function controlliScheda(c) {
    var out = [], mod = c.collegamento, dl = c.locale || {}, n;
    if (!mod) return out;
    var add = function (codice, testo, livello) { out.push({ codice: codice, livello: livello || 'avviso', testo: testo }); };
    var x32 = FAMIGLIE_X32.indexOf(dl.mixer) >= 0;
    if (mod === '2' && x32) {
      n = lineeAes50(c.canali);
      if (n > 32) add('x32Linee', n + ' linee verso il mixer di sala: X32 e M32 ne prendono al massimo 32 mono (gli extra vanno sugli aux in o vanno accorpati).');
      var lib = numeraLinee(c.canali).filter(function (r) { return r.libera && r.linea < n; }).map(function (r) { return r.linea; });
      if (lib.length) add('x32Libera', 'Linea libera ' + lib.join(', ') + ': X32 e M32 patchano a blocchi di 8 e la linea libera spreca un canale. Sposta un canale mono prima della coppia stereo.');
    }
    if (mod !== '4' && canaliWing(c.canali) > 40) add('wing40', canaliWing(c.canali) + ' canali: il WING ne gestisce 40.');
    if ((mod === '2' || mod === '3') && (dl.distanza === null || dl.distanza === undefined)) add('distanza', 'Chiedi la distanza palco–regia, per ' + (mod === '2' ? 'il cavo AES50' : 'il multipolare') + '.');
    if (mod === '3' && (dl.mixer === 'xr18' || dl.mixer === 'mr18')) {
      n = lineeDaSplittare(c.canali).length;
      if (n > 16) add('xr18', n + ' linee da splittare: il mixer del locale ha 16 ingressi microfonici più 2 solo linea (17-18)' + (n > 18 ? ' e non le prende tutte.' : ': sulle 17-18 vanno solo sorgenti di linea.'));
    }
    if (mod === '4' && !(c.monitor || []).length) add('service0mix', 'Service del locale senza mix monitor: scrivi i mix che chiediamo.');
    if (mod === '4') { var rb = righeFornito(c.canali, '4'); if (rb.diversi) add('serviceMicBand', rb.diversi + ' righe con microfono o asta della band.', 'info'); }
    if (mod.indexOf('1A') === 0) {
      if (dl.impianto !== 'si' && !dl.impiantoNote) add('impianto1A', 'Chiedi che impianto hanno (casse, sub, dove ci colleghiamo).');
      var k = conti1A(c);
      if (mod === '1A-mixer' && dl.canaliLiberi !== null && dl.canaliLiberi !== undefined && k.canali > dl.canaliLiberi) add('canaliLiberi', 'Sul loro mixer servono ' + k.canali + ' canali liberi, ne hanno ' + dl.canaliLiberi + '.');
      if (k.uscite > USCITE_WING) add('uscite', 'Servono ' + k.uscite + ' uscite: WING Rack e S16 ne hanno ' + USCITE_WING + '.');
    }
    if (mod === '1B') {
      var ic = (c.palco && c.palco.icone) || [];
      var casse = ic.some(function (o) { return o.tipo === 'cassaPa' || o.tipo === 'sub'; }), prese = ic.some(function (o) { return o.tipo === 'presa'; });
      if (!casse || !prese) add('casse1B', 'Sullo stage plan mancano ' + [!casse ? 'le casse' : '', !prese ? 'le prese' : ''].filter(Boolean).join(' e ') + ': il locale deve sapere dove vanno.');
    }
    return out;
  }
  /** Numero per wa.me: solo cifre, prefisso internazionale; un cellulare italiano senza prefisso riceve il 39. */
  function numeroWa(tel) {
    var t = String(tel || '').trim(), d = t.replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    else if (t.charAt(0) !== '+' && /^3\d{8,9}$/.test(d)) d = '39' + d;
    return d.length >= 6 ? d : '';
  }
  function dataBreve(d) { var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(d || ''); }
  /**
   * D4/D10: messaggio per il contatto del locale. o = { contenuto, serata {data, locale}, referente {nome, telefono},
   * mittente {nome, referente: bool}, rev, tipo ('primaDomanda' per forzarla) }.
   */
  function messaggioTecnico(o) {
    var c = o.contenuto, ser = o.serata || {}, ref = o.referente || {}, mitt = o.mittente || {}, rev = Number(o.rev) || 1;
    var dl = c.locale || {}, mod = o.tipo === 'primaDomanda' ? '' : c.collegamento;
    var primo = String(ref.nome || '').trim().split(/\s+/)[0];
    var intro = mitt.referente ? 'Ciao, sono ' + (primo || mitt.nome) + ', referente tecnico dei Dish for a King.' : 'Ciao, sono ' + mitt.nome + ' dei Dish for a King.';
    var chiusura = mitt.referente ? (ref.telefono ? 'Per qualsiasi dubbio chiamatemi al ' + ref.telefono + '.' : '')
      : (ref.nome ? 'Per le domande tecniche: ' + ref.nome + ', referente tecnico' + (ref.telefono ? ', ' + ref.telefono : '') + '.' : '');
    var quando = 'Per la serata ' + (ser.data ? 'del ' + dataBreve(ser.data) + ' ' : '');
    var corpo, grazie = false;
    if (mod === '2') {
      corpo = quando + 'vi colleghiamo il nostro cavo AES50 (CAT-5e schermato, etherCON) a una porta AES50 libera del vostro mixer. Impostazioni da parte vostra: 48 kHz e sincronizzazione sulla porta AES50 a cui ci colleghiamo. Vi arrivano ' + lineeAes50(c.canali) + ' canali già amplificati, nello stesso ordine della lista allegata (canale 1 = canale 1). Il gain lo gestiamo noi dal palco e resta fermo dopo il line check: voi lavorate con il trim. Phantom gestito da noi. Se volete, ci rimandate il vostro Main L/R sulle uscite AES50 1-2 e lo registriamo.' + (dl.distanza === null || dl.distanza === undefined ? ' Ci serve sapere solo la distanza palco-regia per la lunghezza del cavo.' : '');
    } else if (mod === '3') {
      corpo = quando + 'ci serve uno splitter per ' + lineeDaSplittare(c.canali).length + ' canali sul palco, vicino al nostro rack. Uscita diretta verso di noi, uscita isolata verso il vostro multipolare. Il phantom lo diamo noi: tenete il 48 V spento su tutti i canali splittati. Se sentite ronzii, alzate il ground lift solo su quei canali. Il canale Click non va splittato. In allegato la lista canali numerata nell\'ordine del nostro mixer.';
    } else if (mod === '4') {
      corpo = quando + (ser.locale ? 'al ' + ser.locale + ' ' : '') + 'vi mando la nostra scheda tecnica (Rev. ' + rev + '): ' + lineeTutte(c.canali) + ' linee e ' + (c.monitor || []).length + ' mix monitor.' + (dl.mixer === 'wing' ? ' Se volete vi passiamo la scena del WING già pronta, con patch e nomi.' : '');
      grazie = true;
    } else if (mod === '1A-mixer') {
      var k = conti1A(c);
      var sub = dl.subAux === 'si' ? ', il sub mono' : dl.subAux === 'no' ? '' : ', il sub mono se il vostro sub è su un aux';
      var spie = k.spie === 1 ? ' e 1 linea monitor già mixata per la vostra spia' : k.spie > 1 ? ' e ' + k.spie + ' linee monitor già mixate, una per ogni vostra spia' : '';
      corpo = quando + 'portiamo il nostro mixer digitale e usiamo il vostro impianto, senza toccare i cavi delle vostre casse: entriamo nei canali del vostro mixer con Main L e R' + sub + spie + '. Ci servono ' + k.canali + ' canali liberi, a livello linea, con EQ piatta. Una presa vicino al palco. C\'è un limite di volume o un limitatore? In allegato lo stage plan con i dettagli.';
    } else if (mod === '1A-impianto') {
      corpo = quando + 'portiamo il nostro mixer e usiamo il vostro impianto. Ci servono: che casse e sub avete, dove possiamo collegarci con le nostre uscite XLR (sinistro, destro ed eventualmente sub su una linea a parte) e una presa vicino al palco. C\'è un limite di volume o un limitatore? In allegato lo stage plan.';
    } else if (mod === '1B') {
      var car = c.orari && c.orari.carico ? ' alle ' + c.orari.carico : '';
      corpo = quando + 'portiamo tutto noi, impianto compreso. Ci servono: almeno due prese su linee separate vicino al palco, lo spazio ai lati del palco per casse e sub come nello stage plan allegato, e un accesso comodo per il carico' + car + '. C\'è un limite di volume o un limitatore?';
    } else {
      corpo = quando + 'portiamo per i monitor il nostro mixer digitale Behringer WING con stagebox. Che mixer avete in sala? Se è un WING, un X32 o un M32, vi passiamo tutti i canali con un solo cavo di rete AES50 e non serve nessuno splitter. Altrimenti vi chiediamo uno splitter analogico (meglio a trasformatore) per ' + lineeDaSplittare(c.canali).length + ' canali. Grazie!';
    }
    var agg = rev > 1 && mod ? 'Aggiornamento: Rev. ' + rev + ', sostituisce la Rev. ' + (rev - 1) + '. ' : '';
    return agg + [intro, corpo, chiusura, grazie ? 'Grazie!' : ''].filter(Boolean).join(' ');
  }
  /** D5/D10: riquadro "Collegamento" della pagina 1 del foglio: titolo e cosa chiediamo al locale. Senza modalità: null. */
  function righeCollegamento(c) {
    var mod = c.collegamento, dl = c.locale || {};
    var col = null;
    COLLEGAMENTI.forEach(function (x) { if (x.id === mod) col = x; });
    if (!col) return null;
    var r = [], limite = 'Se c\'è un limite di volume o un limitatore, diteci quale.';
    if (mod === '2') {
      var n = lineeAes50(c.canali);
      r.push('Una porta AES50 libera sul vostro mixer, a 48 kHz, sincronizzato sulla porta a cui ci colleghiamo.');
      r.push('Linea N della channel list = canale N del vostro mixer (1–' + n + '); il Click non vi arriva.');
      r.push('Gain e phantom dal nostro palco: voi lavorate con il trim.');
      r.push(dl.distanza === null || dl.distanza === undefined ? 'Ci serve la distanza palco–regia per il cavo.' : 'Distanza palco–regia: ' + String(dl.distanza).replace('.', ',') + ' m.');
    } else if (mod === '3') {
      r.push('Uno splitter da ' + lineeDaSplittare(c.canali).length + ' canali (meglio a trasformatore) vicino al nostro rack: uscita diretta alla band, uscita isolata al vostro multipolare.');
      r.push('Il 48 V lo diamo noi: sul vostro mixer resta spento su tutti i canali splittati.');
      r.push('Ground lift solo sui canali che ronzano.');
      r.push('Le righe con "Split: no" e il Click non vanno splittati.');
    } else if (mod === '4') {
      r.push('Rider completo nelle pagine seguenti: microfoni, aste e mix monitor.');
    } else if (mod === '1A-mixer') {
      var k = conti1A(c), spie = (c.monitor || []).filter(function (m) { return m.sulleSpieLocale; }).map(function (m) { return 'Spia ' + (m.chi || m.mix); });
      r.push('Entriamo nei canali del vostro mixer, a livello linea, con EQ piatta e filtri spenti: non tocchiamo i cavi delle vostre casse.');
      r.push('Linee: ' + ['Main L', 'Main R'].concat(k.sub ? ['Sub (solo verso l\'aux del sub)'] : []).concat(spie).join(' · ') + (spie.length ? ' (' + (spie.length === 1 ? 'solo verso l\'aux della sua spia' : 'ognuna solo verso l\'aux della sua spia') + ', pre-fader, fuori dal main).' : '.'));
      r.push('Main L e R panpottati tutti a sinistra e tutti a destra, fader a 0 dB; aux master a 0 dB.');
      r.push('Ci servono ' + k.canali + ' canali liberi e una presa vicino al rack.');
      r.push(limite);
    } else if (mod === '1A-impianto') {
      r.push('Ci colleghiamo al vostro impianto con le nostre uscite XLR: sinistro, destro ed eventualmente sub su una linea a parte.');
      r.push('Ci servono una presa vicino al rack e la distanza dal palco a finali o casse, per i cavi.');
      r.push(limite);
    } else if (mod === '1B') {
      r.push('Portiamo impianto e mixer: casse e sub come nello stage plan.');
      r.push('Almeno due prese su linee separate vicino al palco.');
      r.push('Accesso comodo e tempo per carico e montaggio.');
      r.push(limite);
    }
    return { titolo: col.foglio, righe: r };
  }
  /** D9: file per la Scheda Gig 1.13 (campi letti da "Carica"; effetti, PA e S16 restano quelli della Scheda Gig). */
  var FAM_SCHEDA_GIG = { batteria: 'drums', basso: 'bass', chitarre: 'gtr', tastiere: 'keys', fiati: 'fiati', voci: 'vox', basi: 'trk', aux: 'aux' };
  function sorgenteGig(c) {
    if (c.click) return 'PLAYBACK';
    if (/^DI$/i.test(c.mic)) return 'DI';
    if (/modeller/i.test(c.mic)) return 'MODELLER';
    if (/playback|basi/i.test(c.mic) || c.famiglia === 'basi') return 'PLAYBACK';
    if (/^(linea|line)$/i.test(c.mic)) return 'LINE';
    return 'MIC';
  }
  function esportaSchedaGig(c, ser) {
    ser = ser || {};
    var fam = {};
    FAMIGLIE.forEach(function (f) { fam[FAM_SCHEDA_GIG[f.id]] = []; });
    ordinaCanali(c.canali).forEach(function (x) {
      fam[FAM_SCHEDA_GIG[x.famiglia]].push({ name: x.stereo ? nomeStereo(x.sorgente) : x.sorgente, src: sorgenteGig(x), st: x.stereo && !x.click, ph: x.phantom, click: x.click });
    });
    var monitors = (c.monitor || []).map(function (m) {
      var chi = m.chi || m.mix;
      if (m.sulleSpieLocale) return { name: 'Spia locale ' + chi, type: 'wedge', out: 'auto' };
      if (m.tipo === 'IEM mono') return { name: 'IEM mono ' + chi, type: 'wedge', out: 'auto' };
      return { name: chi, type: m.tipo === 'IEM stereo' ? 'iem' : 'wedge', out: 'auto' };
    });
    var note = c.note || '';
    if (c.collegamento === '2') note = (note ? note + '\n' : '') + 'Uscite AES50 B 1–' + lineeAes50(c.canali) + ' verso il FOH: da patchare a mano';
    return { schedaVersion: '1.13', gig: { name: 'Dish for a King', date: ser.data || '', venue: ser.locale || '' }, fam: fam, monitors: monitors, notes: note };
  }

  return {
    VERSIONE_REGOLE: VERSIONE_REGOLE,
    FAMIGLIE: FAMIGLIE,
    ASTE: ASTE,
    FORNITO: FORNITO,
    TIPI_MONITOR: TIPI_MONITOR,
    ICONE_PALCO: ICONE_PALCO,
    POSIZIONI_SCRITTA: POSIZIONI_SCRITTA,
    nomeLinea: nomeLinea,
    riepilogoScheda: riepilogoScheda,
    righeTesto: righeTesto,
    PEZZI_BATTERIA: PEZZI_BATTERIA,
    SET_PARTENZA: SET_PARTENZA,
    AGGANCIO_FINE: AGGANCIO_FINE,
    MAX_CANALI: MAX_CANALI,
    MAX_MIX: MAX_MIX,
    MAX_ICONE: MAX_ICONE,
    AGGANCIO: AGGANCIO,
    PASSO_PALCO: PASSO_PALCO,
    famigliaDi: famigliaDi,
    normalizzaCanale: normalizzaCanale,
    ordinaCanali: ordinaCanali,
    numeraLinee: numeraLinee,
    etichettaLinee: etichettaLinee,
    testoMic: testoMic,
    normalizzaMix: normalizzaMix,
    normalizzaIcona: normalizzaIcona,
    normalizzaScheda: normalizzaScheda,
    normalizzaReferente: normalizzaReferente,
    revisioneDopoModifica: revisioneDopoModifica,
    pieDiPagina: pieDiPagina,
    MIXER_LOCALE: MIXER_LOCALE,
    COLLEGAMENTI: COLLEGAMENTI,
    RUOLI_CONTATTO: RUOLI_CONTATTO,
    USCITE_WING: USCITE_WING,
    normalizzaLocale: normalizzaLocale,
    normalizzaDatiLocale: normalizzaDatiLocale,
    suggerisciModalita: suggerisciModalita,
    fornitoModalita: fornitoModalita,
    righeFornito: righeFornito,
    applicaFornito: applicaFornito,
    cercaLocali: cercaLocali, localePerNome: localePerNome, schedaConLocale: schedaConLocale, serateDaCollegare: serateDaCollegare,
    lineeAes50: lineeAes50,
    lineeDaSplittare: lineeDaSplittare,
    lineeTutte: lineeTutte,
    canaliWing: canaliWing,
    conti1A: conti1A,
    controlliScheda: controlliScheda,
    numeroWa: numeroWa,
    dataBreve: dataBreve,
    messaggioTecnico: messaggioTecnico,
    esportaSchedaGig: esportaSchedaGig,
    righeCollegamento: righeCollegamento,
    TAPPA: TAPPA,
    MEMBRI: MEMBRI,
    ADMIN: ADMIN,
    SIGLE: SIGLE,
    ALFABETO_CODICE: ALFABETO_CODICE,
    LUNGHEZZA_CODICE: LUNGHEZZA_CODICE,
    formatoCodiceValido: formatoCodiceValido,
    codiceDaByte: codiceDaByte,
    IMPOSTAZIONI: IMPOSTAZIONI,
    giaAttiva: giaAttiva,
    predefinite: predefinite,
    normalizzaImpostazioni: normalizzaImpostazioni,
    MAGGIORI: MAGGIORI,
    MINORI: MINORI,
    ORIGINALI: ORIGINALI,
    NOTAZIONI: NOTAZIONI,
    leggiTonalita: leggiTonalita,
    tonalitaValida: tonalitaValida,
    trasponi: trasponi,
    ACCORDATURE: ACCORDATURE,
    offsetAccordatura: offsetAccordatura,
    nomeTonalita: nomeTonalita,
    tonalitaBrano: tonalitaBrano,
    METRI: METRI,
    RIFERIMENTI: RIFERIMENTI,
    FEEL: FEEL,
    BPM_MIN: BPM_MIN,
    BPM_MAX: BPM_MAX,
    STATI_BRANO: STATI_BRANO,
    riferimentoSuggerito: riferimentoSuggerito,
    leggiDurata: leggiDurata,
    scriviDurata: scriviDurata,
    idValido: idValido,
    idStato: idStato,
    normalizzaBrano: normalizzaBrano,
    tapAggiungi: tapAggiungi,
    tapBpm: tapBpm,
    STATI_STUDIO: STATI_STUDIO,
    STATO_PREDEFINITO: STATO_PREDEFINITO,
    statoDi: statoDi,
    prontoPerTutti: prontoPerTutti,
    FILTRI: FILTRI,
    filtra: filtra,
    TIPI_SEZIONE: TIPI_SEZIONE,
    MAX_SEZIONI: MAX_SEZIONI,
    MAX_RIPETIZIONI: MAX_RIPETIZIONI,
    MAX_BATTUTE: MAX_BATTUTE,
    PARTI: PARTI,
    QUARTI_PER_BATTUTA: QUARTI_PER_BATTUTA,
    QUARTI_PER_BATTITO: QUARTI_PER_BATTITO,
    leggiChiSuona: leggiChiSuona,
    scriviChiSuona: scriviChiSuona,
    parteSuccessiva: parteSuccessiva,
    gruppiChiSuona: gruppiChiSuona,
    normalizzaSezione: normalizzaSezione,
    normalizzaStruttura: normalizzaStruttura,
    nomiSezioni: nomiSezioni,
    tempoSezione: tempoSezione,
    secondiSezione: secondiSezione,
    durataStruttura: durataStruttura,
    durataEffettiva: durataEffettiva,
    scriviDifferenza: scriviDifferenza,
    MAX_TESTO: MAX_TESTO,
    MAX_TESTI: MAX_TESTI,
    LINGUE_OCR: LINGUE_OCR,
    SOGLIA_QUASI_UGUALE: SOGLIA_QUASI_UGUALE,
    GIORNI_NOVITA: GIORNI_NOVITA,
    STRUMENTALI: STRUMENTALI,
    testoPulitoBase: testoPulitoBase,
    testoDaSalvare: testoDaSalvare,
    rigaDiAccordi: rigaDiAccordi,
    leggiEtichetta: leggiEtichetta,
    chiaveBlocco: chiaveBlocco,
    somiglianza: somiglianza,
    analizzaTesto: analizzaTesto,
    proponiStruttura: proponiStruttura,
    sezioneCantata: sezioneCantata,
    abbinaAStruttura: abbinaAStruttura,
    normalizzaTesto: normalizzaTesto,
    primaRiga: primaRiga,
    TIPI_AVVISO: TIPI_AVVISO,
    testoAvvisoTesto: testoAvvisoTesto,
    giorniPrima: giorniPrima,
    TEMPO_MIN: TEMPO_MIN,
    TEMPO_MAX: TEMPO_MAX,
    TEMPO_PASSO: TEMPO_PASSO,
    tempoValido: tempoValido,
    battitiPerBattuta: battitiPerBattuta,
    battitiInteri: battitiInteri,
    colpiBattuta: colpiBattuta,
    pianoLibero: pianoLibero,
    pianoMetronomo: pianoMetronomo,
    secondiBattito: secondiBattito,
    durataPiano: durataPiano,
    TIPI_RIGA: TIPI_RIGA,
    MAX_SCALETTA: MAX_SCALETTA,
    PAUSA_MIN: PAUSA_MIN,
    PAUSA_MAX: PAUSA_MAX,
    PAUSA_PROPOSTA: PAUSA_PROPOSTA,
    MAX_LIBERA: MAX_LIBERA,
    MAX_MINUTI_LIBERA: MAX_MINUTI_LIBERA,
    MAX_NOTA_RIGA: MAX_NOTA_RIGA,
    leggiData: leggiData,
    leggiOrario: leggiOrario,
    scriviData: scriviData,
    serataPassata: serataPassata,
    ordinaSerate: ordinaSerate,
    normalizzaSerata: normalizzaSerata,
    normalizzaRigaScaletta: normalizzaRigaScaletta,
    normalizzaScaletta: normalizzaScaletta,
    braniInOrdine: braniInOrdine,
    doppioniScaletta: doppioniScaletta,
    sommaOrario: sommaOrario,
    riepilogoScaletta: riepilogoScaletta,
    scriviDurataSet: scriviDurataSet,
    rigaStampa: rigaStampa,
    POI_MIN_SECONDI: POI_MIN_SECONDI,
    CARATTERI_PALCO: CARATTERI_PALCO,
    vociPalco: vociPalco,
    scriviRigaSpeciale: scriviRigaSpeciale,
    pianoPalco: pianoPalco,
    metroLetto: metroLetto,
    sistemaMetri: sistemaMetri,
    motivoBreve: motivoBreve,
    sezioneAlTempo: sezioneAlTempo,
    EVENTI_SYNC: EVENTI_SYNC,
    SYNC_SCADENZA_MS: SYNC_SCADENZA_MS,
    inizioSync: inizioSync,
    messaggioPalco: messaggioPalco,
    messaggioValido: messaggioValido,
    leggiMessaggio: leggiMessaggio,
    vistaSync: vistaSync,
    nomeFileSerata: nomeFileSerata,
    fileSerata: fileSerata
  };
})();

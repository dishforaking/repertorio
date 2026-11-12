/**
 * DFAK – Regole condivise tra telefono (regole.js su GitHub) e motore (Regole.gs in Apps Script).
 * I DUE FILE DEVONO ESSERE IDENTICI BYTE PER BYTE: il banco di prova lo controlla a ogni consegna.
 * T1: membri, codici, impostazioni personali.
 * T2: tonalità (forme, scostamento, suono reale, notazione), accordature, controlli del brano,
 *     durata manuale, tap tempo, stati di studio, filtri.
 */
var Regole = (function () {
  var VERSIONE_REGOLE = 2;
  var TAPPA = 2;   // le impostazioni con "dalla" successiva mostrano l'etichetta "attiva dalla Tx"

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
    { chiave: 'metronomoAttivo', etichetta: 'Metronomo attivo', tipo: 'si-no', predefinito: true, dalla: 'T6' },
    { chiave: 'metronomoSuddivisione', etichetta: 'Metronomo: suddivisione', tipo: 'scelta', valori: ['Quarti', 'Ottavi'], predefinito: 'Quarti', dalla: 'T6' },
    { chiave: 'metronomoAccento', etichetta: 'Metronomo: accento sul primo', tipo: 'si-no', predefinito: true, dalla: 'T6' },
    { chiave: 'metronomoVolume', etichetta: 'Metronomo: volume', tipo: 'numero', min: 0, max: 100, passo: 5, predefinito: 80, dalla: 'T6' },
    { chiave: 'metronomoConteggio', etichetta: 'Metronomo: battute di conteggio', tipo: 'scelta', valori: ['0', '1', '2'], predefinito: '1', dalla: 'T6' },
    { chiave: 'metronomoLampeggio', etichetta: 'Metronomo: lampeggio sullo schermo', tipo: 'si-no', predefinito: false, dalla: 'T6' },
    { chiave: 'caratteriPalco', etichetta: 'Caratteri in Modalità Palco', tipo: 'scelta', valori: ['Grandi', 'Molto grandi', 'Enormi'], predefinito: 'Molto grandi', dalla: 'T8' }
  ];
  function giaAttiva(d) { return Number(String(d.dalla).replace('T', '')) <= TAPPA; }

  function predefinite() {
    var o = {};
    for (var i = 0; i < IMPOSTAZIONI.length; i++) o[IMPOSTAZIONI[i].chiave] = IMPOSTAZIONI[i].predefinito;
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
  function normalizzaImpostazioni(dati) {
    var valori = predefinite(), errori = [];
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
  var METRI = ['4/4', '3/4', '2/4', '6/8', '12/8'];
  var RIFERIMENTI = ['Quarti', 'Ottavi', 'Quarti puntati'];
  var BPM_MIN = 30, BPM_MAX = 300;
  var STATI_BRANO = ['Proposto', 'In prova', 'Definitivo', 'Archivio'];
  /** Con 6/8 e 12/8 si suggeriscono i quarti puntati (solo un suggerimento). */
  function riferimentoSuggerito(metro) { return metro === '6/8' || metro === '12/8' ? 'Quarti puntati' : 'Quarti'; }

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

  return {
    VERSIONE_REGOLE: VERSIONE_REGOLE,
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
    filtra: filtra
  };
})();

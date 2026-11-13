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
 */
var Regole = (function () {
  var VERSIONE_REGOLE = 5;
  var TAPPA = 6;   // le impostazioni con "dalla" successiva mostrano l'etichetta "attiva dalla Tx"

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
      metro: sez.metro || brano.metro || '4/4',
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
    var tempoBrano = { bpm: brano.bpm, metro: brano.metro || '4/4', riferimento: brano.riferimento || 'Quarti', feel: brano.feel || 'Dritto' };
    if (!sezioni.length) return pianoLibero(tempoBrano, opzioni, 'libero: il brano non ha ancora una struttura');
    var nomi = nomiSezioni(sezioni), senzaBattute = [], senzaBpm = [], nonIntere = [];
    sezioni.forEach(function (s, i) {
      var t = tempoSezione(s, brano);
      if (vuoto(s.battute) || !(Number(s.battute) > 0)) senzaBattute.push(nomi[i]);
      else if (!(t.bpm > 0)) senzaBpm.push(nomi[i]);
      else if (!battitiInteri(t.metro, t.riferimento)) nonIntere.push(nomi[i] + ' (' + t.metro + ' a ' + t.riferimento.toLowerCase() + ')');
    });
    if (senzaBattute.length) return pianoLibero(tempoBrano, opzioni, 'libero: mancano le battute in ' + senzaBattute.join(', '));
    if (senzaBpm.length) return pianoLibero(tempoBrano, opzioni, 'libero: manca il BPM in ' + senzaBpm.join(', '));
    if (nonIntere.length) return pianoLibero(tempoBrano, opzioni, 'libero: battute non intere in ' + nonIntere.join(', '));
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
    durataPiano: durataPiano
  };
})();

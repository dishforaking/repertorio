/**
 * DFAK – Regole condivise tra telefono (regole.js su GitHub) e motore (Regole.gs in Apps Script).
 * I DUE FILE DEVONO ESSERE IDENTICI BYTE PER BYTE: il banco di prova lo controlla a ogni consegna.
 * T1: solo funzioni comuni (membri, codici, impostazioni personali). Dalla T2 si aggiungono
 * tonalità e notazione, durata, voti, suddivisione dei testi.
 */
var Regole = (function () {
  var VERSIONE_REGOLE = 1;

  /* Membri: sigle da mixer fisse. ADMIN non è un membro: non vota e non conta nei 5 sì. */
  var MEMBRI = [
    { sigla: 'VOX', nome: 'Ale', ruolo: 'Voce' },
    { sigla: 'GTR1', nome: 'Paolo', ruolo: 'Chitarra 1' },
    { sigla: 'GTR2', nome: 'Ste', ruolo: 'Chitarra 2' },
    { sigla: 'BASS', nome: 'Jack', ruolo: 'Basso' },
    { sigla: 'DRUM', nome: 'Chicco', ruolo: 'Batteria' }
  ];
  var ADMIN = { sigla: 'ADMIN', nome: 'Amministrazione', ruolo: 'Amministrazione' };

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

  return {
    VERSIONE_REGOLE: VERSIONE_REGOLE,
    MEMBRI: MEMBRI,
    ADMIN: ADMIN,
    ALFABETO_CODICE: ALFABETO_CODICE,
    LUNGHEZZA_CODICE: LUNGHEZZA_CODICE,
    formatoCodiceValido: formatoCodiceValido,
    codiceDaByte: codiceDaByte,
    IMPOSTAZIONI: IMPOSTAZIONI,
    predefinite: predefinite,
    normalizzaImpostazioni: normalizzaImpostazioni
  };
})();

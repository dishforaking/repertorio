/* DFAK – Repertorio · metronomo.js (T6): l'orologio audio del metronomo.
 * Il piano (quali colpi, in che battiti, con che BPM) lo fanno le regole (Regole.pianoMetronomo / pianoLibero);
 * qui si trasformano i battiti in secondi sull'orologio audio del telefono e si suonano.
 * - Programmazione anticipata: ogni 25 ms si programmano i colpi dei prossimi 200 ms (variante T6: 100 ms lasciavano
 *   nel banco un margine minimo di 2,3 ms; con 200 ms un telefono bloccato fino a ~175 ms non salta colpi).
 * - (non ovvio) Gli orari si calcolano dall'inizio del tratto: inizio + n × durata della battuta, mai sommando
 *   colpo per colpo, così in 5 minuti non si accumula errore. Un cambio di tempo apre un tratto nuovo alla battuta.
 * - Un colpo che il telefono non è riuscito a programmare in tempo NON si suona in ritardo: si salta.
 * - Colpi generati una volta (niente file audio): accento 2 kHz, battito 1 kHz, suddivisione 1 kHz a −10 dB;
 *   attacco 1 ms, decadimento esponenziale fino a −60 dB a 40 ms. Picco −1 dBFS con il volume a 100,
 *   −2 dB ogni 5 punti in meno, 0 = muto. Un solo canale: Web Audio lo manda uguale a sinistra e a destra.
 * - Conteggio d'ingresso (variante T6): suono di bacchette, rumore nella banda 3–5 kHz lungo 15 ms; il primo colpo
 *   di ogni battuta di conteggio a −1 dBFS (volume 100), gli altri 6 dB sotto. Nel conteggio solo i battiti, niente
 *   suddivisioni. Ogni colpo del conteggio porta il suo numero (1 2 3 4) per le scritte.
 * - Lampeggio e scritte seguono quello che si SENTE: l'orario del colpo più il ritardo d'uscita dichiarato.
 * Per la V2: stesso contesto audio (contesto()), stesso rallentamento (cambiaTempo), posizione in battute (posizione()).
 */
'use strict';
var Metronomo = (function () {
  var ANTICIPO_S = 0.2, OGNI_MS = 25, PARTENZA_S = 0.12;
  var FREQ = { accento: 2000, battito: 1000, suddivisione: 1000 };
  var LIVELLO = { accento: 1, battito: 1, suddivisione: Math.pow(10, -10 / 20) };
  var PICCO = Math.pow(10, -1 / 20);
  var DURATA_S = 0.04, ATTACCO_S = 0.001;
  var BACCHETTA = { durata: 0.015, attacco: 0.0005, da: 3000, a: 5000, passo: 10, forte: 1, piano: Math.pow(10, -6 / 20) };

  /** Guadagno del volume (0–100): 100 = 0 dB, −2 dB ogni 5 punti, 0 = muto. */
  function guadagnoVolume(v) {
    v = Math.min(100, Number(v));
    if (!(v > 0)) return 0;
    return Math.pow(10, (-(100 - v) / 5 * 2) / 20);
  }

  /** Un colpo come buffer audio mono, già al suo livello relativo (picco 1 per accento e battito). */
  function creaColpo(ctx, tipo) {
    var sr = ctx.sampleRate, n = Math.round(DURATA_S * sr);
    var buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    var tau = (DURATA_S - ATTACCO_S) / Math.log(1000), max = 0, i;
    for (i = 0; i < n; i++) {
      var t = i / sr;
      var inv = t < ATTACCO_S ? t / ATTACCO_S : Math.exp(-(t - ATTACCO_S) / tau);
      if (i > n - sr * 0.001) inv *= (n - i) / (sr * 0.001);        // ultimo millisecondo a zero: niente "clic" in coda
      d[i] = inv * Math.sin(2 * Math.PI * FREQ[tipo] * t);
      max = Math.max(max, Math.abs(d[i]));
    }
    for (i = 0; i < n; i++) d[i] = d[i] / max * LIVELLO[tipo];
    return buf;
  }
  /**
   * Bacchette del conteggio: somma di sinusoidi ogni 10 Hz da 3 a 5 kHz con fasi casuali (rumore che sta solo in
   * quella banda), attacco 0,5 ms, decadimento esponenziale fino a −60 dB a 15 ms, ultimo millisecondo a zero.
   * (non ovvio) Le fasi vengono da un generatore con seme fisso: il colpo è identico su ogni telefono e a ogni avvio,
   * quindi il livello di picco è esatto e il banco lo può misurare.
   */
  function creaBacchetta(ctx, livello) {
    var sr = ctx.sampleRate, n = Math.round(BACCHETTA.durata * sr);
    var buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    var seme = 20261113, fasi = [], f, i, max = 0;
    for (f = BACCHETTA.da; f <= BACCHETTA.a; f += BACCHETTA.passo) {
      seme = (seme * 1664525 + 1013904223) >>> 0;
      fasi.push([f, seme / 4294967296 * 2 * Math.PI]);
    }
    var tau = (BACCHETTA.durata - BACCHETTA.attacco) / Math.log(1000);
    for (i = 0; i < n; i++) {
      var t = i / sr, x = 0;
      for (var k = 0; k < fasi.length; k++) x += Math.sin(2 * Math.PI * fasi[k][0] * t + fasi[k][1]);
      var inv = t < BACCHETTA.attacco ? t / BACCHETTA.attacco : Math.exp(-(t - BACCHETTA.attacco) / tau);
      if (i > n - sr * 0.001) inv *= (n - i) / (sr * 0.001);
      d[i] = x * inv;
      max = Math.max(max, Math.abs(d[i]));
    }
    for (i = 0; i < n; i++) d[i] = d[i] / max * livello;
    return buf;
  }
  function creaColpi(ctx) {
    return { accento: creaColpo(ctx, 'accento'), battito: creaColpo(ctx, 'battito'), suddivisione: creaColpo(ctx, 'suddivisione'),
      bacchettaForte: creaBacchetta(ctx, BACCHETTA.forte), bacchetta: creaBacchetta(ctx, BACCHETTA.piano) };
  }
  /** Quanti battiti fa una battuta "vera" del conteggio: serve per numerare 1 2 3 4 anche quando il conteggio
   *  è fatto di battute da 1 battito (battiti per battuta non interi, es. 4/4 a quarti puntati). */
  function gruppoConteggio(tr) {
    if (tr.battitiBattuta > 1) return tr.battitiBattuta;
    if (typeof Regole !== 'undefined' && Regole.battitiPerBattuta) return Math.max(1, Math.round(Regole.battitiPerBattuta(tr.metro, tr.riferimento)));
    return 1;
  }

  /**
   * Una corsa sul piano: dà i colpi uno dopo l'altro con il loro orario (secondi dell'orologio audio).
   * tempo = rallentamento in percento; cambi di tempo e di BPM (metronomo da solo) valgono dalla battuta successiva.
   */
  function Corsa(piano, tempo, inizio) {
    this.tratti = piano.tratti.map(function (t) {
      var o = {}; for (var k in t) o[k] = t[k];
      if (o.conteggio) { o.colpi = o.colpi.filter(function (c) { return c.tipo !== 'suddivisione'; }); o.gruppo = gruppoConteggio(o); }
      return o;
    });
    this.i = 0; this.battuta = 0; this.colpo = 0;
    this.tempo = tempo || 100; this.tempoVoluto = this.tempo; this.bpmVoluto = null; this.colpiVoluti = null;
    this.fine = false; this.fineQuando = null;
    this.apriTratto(inizio);
  }
  Corsa.prototype.apriTratto = function (t0) {
    var tr = this.tratti[this.i];
    this.segT0 = t0; this.segBattute = 0;
    this.secBattito = 60 / (tr.bpm * this.tempo / 100);
    this.secBattuta = this.secBattito * tr.battitiBattuta;
    this.inizioBattuta = t0;
  };
  Corsa.prototype.prossimoQuando = function () {
    if (this.fine) return Infinity;
    return this.inizioBattuta + this.tratti[this.i].colpi[this.colpo].pos * this.secBattito;
  };
  Corsa.prototype.prossimo = function () {
    if (this.fine) return null;
    var tr = this.tratti[this.i], c = tr.colpi[this.colpo];
    var giriTot = tr.battute === null ? null : tr.battute;
    var battito = Math.floor(c.pos + 1e-9) + 1, tipo = c.tipo, numero = null;
    if (tr.conteggio) {
      numero = (this.battuta * tr.battitiBattuta + battito - 1) % tr.gruppo + 1;
      tipo = numero === 1 ? 'bacchettaForte' : 'bacchetta';
    }
    var ev = {
      quando: this.inizioBattuta + c.pos * this.secBattito, tipo: tipo, numero: numero, tratto: this.i, colpo: this.colpo,
      battito: battito, nuovaBattuta: this.colpo === 0,
      battuta: giriTot === null ? this.battuta + 1 : this.battuta % tr.battute + 1,
      giro: giriTot === null ? 1 : Math.floor(this.battuta / tr.battute) + 1,
      bpm: tr.bpm * this.tempo / 100, tempo: this.tempo
    };
    this.colpo++;
    if (this.colpo >= tr.colpi.length) {
      this.colpo = 0; this.battuta++; this.segBattute++;
      var fineBattuta = this.segT0 + this.segBattute * this.secBattuta;
      var finito = tr.battute !== null && this.battuta >= tr.battute * tr.giri;
      if (finito) {
        this.i++; this.battuta = 0;
        if (this.i >= this.tratti.length) { this.fine = true; this.fineQuando = fineBattuta; return ev; }
      }
      var cambiaTempo = this.tempoVoluto !== this.tempo, cambiaBpm = this.bpmVoluto !== null && !this.tratti[this.i].conteggio;
      if (cambiaTempo) this.tempo = this.tempoVoluto;
      if (cambiaBpm) { this.tratti[this.i].bpm = this.bpmVoluto; this.bpmVoluto = null; }
      // Suddivisione cambiata al volo (metronomo da solo): stessi battiti, colpi nuovi dalla battuta successiva
      if (this.colpiVoluti && !this.tratti[this.i].conteggio) { this.tratti[this.i].colpi = this.colpiVoluti; this.colpiVoluti = null; }
      if (finito || cambiaTempo || cambiaBpm) this.apriTratto(fineBattuta);
      else this.inizioBattuta = fineBattuta;
    }
    return ev;
  };

  /** Il metronomo che suona davvero (uno per pagina). */
  function crea() {
    var ctx = null, master = null, colpi = null, timer = null, raf = null, corsa = null, piano = null;
    var sorgenti = [], coda = [], ascolto = {}, attuale = null;
    var api = { registro: null };     // il banco ci mette un elenco: orari programmati e margini

    function emetti(nome, dati) { (ascolto[nome] || []).forEach(function (fn) { try { fn(dati); } catch (e) { /* un errore dell'app non ferma il click */ } }); }
    function prepara() {
      if (!ctx) {
        var C = window.AudioContext || window.webkitAudioContext;
        ctx = new C({ latencyHint: 'interactive' });
        master = ctx.createGain(); master.connect(ctx.destination);
        colpi = creaColpi(ctx);
      }
      return ctx.state === 'running' ? Promise.resolve() : ctx.resume();
    }
    function ritardoUscita() { return ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0; }
    function programma(ev) {
      var adesso = ctx.currentTime;
      if (api.registro) api.registro.push({ quando: ev.quando, tipo: ev.tipo, numero: ev.numero, tratto: ev.tratto, battuta: ev.battuta, giro: ev.giro, colpo: ev.colpo, margine: ev.quando - adesso, saltato: ev.quando < adesso });
      if (ev.quando >= adesso) {
        var s = ctx.createBufferSource();
        s.buffer = colpi[ev.tipo]; s.connect(master); s.start(ev.quando);
        sorgenti.push(s);
        s.onended = function () { var k = sorgenti.indexOf(s); if (k >= 0) sorgenti.splice(k, 1); };
      }
      coda.push(ev);
    }
    function giro() {
      if (!corsa) return;
      var limite = ctx.currentTime + ANTICIPO_S;
      while (!corsa.fine && corsa.prossimoQuando() < limite) programma(corsa.prossimo());
      if (corsa.fine && !corsa.fineInCoda) { corsa.fineInCoda = true; coda.push({ fine: true, quando: corsa.fineQuando }); }
    }
    function guarda() {
      if (!corsa && !coda.length) { raf = null; return; }
      var udibile = ctx.currentTime - ritardoUscita();
      while (coda.length && coda[0].quando <= udibile) {
        var ev = coda.shift();
        if (ev.fine) { raf = null; emetti('fine', {}); ferma('fine'); return; }   // il prossimo ▶ deve far ripartire il ciclo delle scritte
        var tr = piano.tratti[ev.tratto];
        attuale = { tratto: ev.tratto, sezione: tr.sezione, nome: tr.nome, conteggio: tr.conteggio, battuta: ev.battuta, battute: tr.battute, giro: ev.giro, giri: tr.giri,
          battito: ev.battito, bpm: ev.bpm, metro: tr.metro, riferimento: tr.riferimento, tempo: ev.tempo, prossimo: prossimoDa(ev) };
        if (ev.nuovaBattuta) emetti('battuta', attuale);
        emetti('colpo', { tipo: ev.tipo, battito: ev.battito, conteggio: tr.conteggio, numero: ev.numero });
      }
      raf = requestAnimationFrame(guarda);
    }
    /** "poi: Rit 3 tra 6 battute" (solo con la struttura). */
    function prossimoDa(ev) {
      var tr = piano.tratti[ev.tratto], dopo = piano.tratti[ev.tratto + 1];
      if (!dopo || tr.battute === null) return null;
      var fatte = (ev.giro - 1) * tr.battute + ev.battuta;
      return { nome: dopo.nome, tra: tr.battute * tr.giri - fatte + 1 };
    }

    api.su = function (nome, fn) { (ascolto[nome] = ascolto[nome] || []).push(fn); return api; };
    /** Parte (va chiamata da un tocco: il telefono apre l'audio solo dopo un gesto). opzioni: { tempo, volume }. */
    api.avvia = function (pianoNuovo, opzioni) {
      opzioni = opzioni || {};
      ferma('riavvio');
      if (!pianoNuovo || !pianoNuovo.tratti || !pianoNuovo.tratti.length) return Promise.resolve(false);
      return prepara().then(function () {
        piano = pianoNuovo;
        master.gain.setValueAtTime(PICCO * guadagnoVolume(opzioni.volume === undefined ? 80 : opzioni.volume), ctx.currentTime);
        corsa = new Corsa(piano, opzioni.tempo || 100, ctx.currentTime + PARTENZA_S);
        timer = setInterval(giro, OGNI_MS); giro();
        if (!raf) raf = requestAnimationFrame(guarda);
        emetti('avvio', {});
        return true;
      });
    };
    /** modo: 'mano' (Stop o uscita), 'fine' (struttura finita), 'riavvio' (nessun avviso). */
    function ferma(modo) {
      if (timer) clearInterval(timer);
      timer = null;
      sorgenti.splice(0).forEach(function (s) { try { s.stop(); } catch (e) { /* già finito */ } });
      var eraInCorso = !!corsa;
      corsa = null; coda = []; attuale = null;
      if (eraInCorso && modo !== 'riavvio') emetti('fermo', { fine: modo === 'fine' });
    }
    api.ferma = function () { ferma('mano'); };
    api.inCorso = function () { return !!corsa; };
    /** Rallentamento (50–100): vale dalla battuta successiva. */
    api.cambiaTempo = function (t) { if (corsa) corsa.tempoVoluto = t; };
    /** Metronomo da solo: BPM nuovo dalla battuta successiva. */
    api.cambiaBpm = function (bpm) { if (corsa) corsa.bpmVoluto = bpm; };
    /** Metronomo da solo: suddivisione cambiata al volo (colpi della battuta, stessi battiti), dalla battuta successiva. */
    api.cambiaColpi = function (colpi) { if (corsa) corsa.colpiVoluti = colpi; };
    api.cambiaVolume = function (v) { if (master) master.gain.setValueAtTime(PICCO * guadagnoVolume(v), ctx.currentTime); };
    api.posizione = function () { return attuale; };
    api.contesto = function () { return ctx; };
    return api;
  }

  /**
   * Per il banco di prova: lo stesso calcolo degli orari, suonato in un contesto audio "offline" (senza altoparlante).
   * Restituisce { buffer, eventi } con l'audio generato e gli orari programmati.
   */
  function rendiOffline(piano, opzioni) {
    opzioni = opzioni || {};
    var sr = opzioni.sampleRate || 48000, sec = opzioni.secondi || 10, inizio = 0.05;
    var C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ctx = new C(1, Math.ceil(sec * sr), sr), master = ctx.createGain(), colpi = creaColpi(ctx), eventi = [];
    master.gain.value = PICCO * guadagnoVolume(opzioni.volume === undefined ? 100 : opzioni.volume);
    master.connect(ctx.destination);
    var corsa = new Corsa(piano, opzioni.tempo || 100, inizio);
    while (!corsa.fine && corsa.prossimoQuando() < sec - DURATA_S) {
      var ev = corsa.prossimo(), s = ctx.createBufferSource();
      s.buffer = colpi[ev.tipo]; s.connect(master); s.start(ev.quando);
      eventi.push(ev);
    }
    return ctx.startRendering().then(function (buffer) { return { buffer: buffer, eventi: eventi, inizio: inizio, fine: corsa.fine ? corsa.fineQuando : null }; });
  }

  return { crea: crea, rendiOffline: rendiOffline, guadagnoVolume: guadagnoVolume, PICCO: PICCO, Corsa: Corsa, BACCHETTA: BACCHETTA };
})();

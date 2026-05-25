// src/utils/sosAudio.js

let audioCtx = null;
let oscillators = [];
let gainNode = null;
let isPlaying = false;

/**
 * Memulai alarm SOS dengan suara "Gameshow Buzzer" yang sangat garang (TEEEETTTT)
 * Menggunakan perpaduan square waves frekuensi rendah untuk efek dengungan keras
 */
export function startSOSAlarm() {
  if (isPlaying) return;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }

    // Gain node untuk volume maksimal
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
    // Kita set ke 0.9 untuk suara yang sangat keras dan sedikit "crunchy" (garang)
    gainNode.gain.value = 0.9; 

    // Daftar frekuensi untuk menciptakan suara "TEEEET" yang tebal dan bergetar
    // Kita gunakan frekuensi rendah (180Hz-ish) dengan detuning agresif
    const baseFreq = 180;
    const tones = [
      { freq: baseFreq, type: 'square' },      // Core buzz
      { freq: baseFreq + 2, type: 'square' },  // Detune for vibration
      { freq: baseFreq - 2, type: 'square' },  // Detune for vibration
      { freq: baseFreq * 2, type: 'sawtooth' }, // Harmonic richness
      { freq: 1200, type: 'square', gain: 0.3 } // Piercing high-tone additive
    ];
    
    oscillators = tones.map(tone => {
      const osc = audioCtx.createOscillator();
      osc.type = tone.type;
      osc.frequency.value = tone.freq;
      
      if (tone.gain) {
        const localGain = audioCtx.createGain();
        localGain.gain.value = tone.gain;
        osc.connect(localGain);
        localGain.connect(gainNode);
      } else {
        osc.connect(gainNode);
      }
      
      osc.start();
      return osc;
    });

    isPlaying = true;
  } catch (err) {
    console.error("Gagal memutar audio SOS:", err);
  }
}

/**
 * Menghentikan semua oscillator dan membersihkan resource audio
 */
export function stopSOSAlarm() {
  if (!isPlaying) return;
  
  try {
    oscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {
        // Abaikan jika sudah berhenti
      }
    });
    oscillators = [];
    
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    
    isPlaying = false;
  } catch (err) {
    console.error("Gagal menghentikan audio SOS:", err);
  }
}


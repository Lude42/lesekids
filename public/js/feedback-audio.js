// === file: public/js/feedback-audio.js ===============================
// Dieses Skript ersetzt die TTS-Ausgabe bei que2a durch Play/Stop-Buttons,
// die eine lokale Audiodatei abspielen (public/audio/itemX.mp3)

(function(){
  const state = {
    audio: null,
    currentSrc: null,
    playing: false,
  };

  function ensureAudio(src){
    if (!state.audio) {
      state.audio = new Audio();
      state.audio.addEventListener('ended', () => updateButtons(false));
      state.audio.addEventListener('pause', () => updateButtons(false));
      state.audio.addEventListener('play', () => updateButtons(true));
      state.audio.addEventListener('error', () => {
        updateButtons(false);
        console.warn('Audio konnte nicht geladen werden:', state.audio?.src);
        alert('Audio konnte nicht geladen werden. Prüfe, ob die Datei existiert.');
      });
    }
    if (state.currentSrc !== src) {
      state.audio.src = src;
      state.currentSrc = src;
    }
    return state.audio;
  }

  function updateButtons(isPlaying){
    state.playing = !!isPlaying;
    const playBtn = document.querySelector('[data-audio-play]');
    const stopBtn = document.querySelector('[data-audio-stop]');
    if (playBtn) playBtn.disabled = isPlaying;
    if (stopBtn) stopBtn.disabled = !isPlaying;
  }

  function mountUI(mount){
    mount.innerHTML = `
      <div class="audio-controls" style="display:flex; gap:.5rem; align-items:center;">
        <button type="button" data-audio-play>▶️ Play</button>
        <button type="button" data-audio-stop disabled>⏹ Stop</button>
        <span class="audio-status" style="font-size:.9rem; opacity:.8;"></span>
      </div>
    `;
  }

  function wireHandlers(audio, mount){
    const playBtn = mount.querySelector('[data-audio-play]');
    const stopBtn = mount.querySelector('[data-audio-stop]');
    const status  = mount.querySelector('.audio-status');

    playBtn.onclick = async () => {
      try { await audio.play(); status.textContent = 'Wird abgespielt…'; } 
      catch (e) { console.error(e); status.textContent = 'Fehler beim Abspielen'; }
    };
    stopBtn.onclick = () => { audio.pause(); audio.currentTime = 0; status.textContent = 'Gestoppt'; };
  }

  // Public API
  window.renderFeedbackAudio = function renderFeedbackAudio({ item, mountId = 'feedback-audio', autoplay = false }){
    const mount = document.getElementById(mountId);
    if (!mount) { console.warn('Mount not found:', mountId); return; }
    const src = `/audio/item${Number(item)}.mp3`;
    const audio = ensureAudio(src);
    mountUI(mount);
    wireHandlers(audio, mount);
    updateButtons(false);
    if (autoplay) {
      // try autoplay (may be blocked by browser policies)
      audio.play().catch(()=>{});
    }
  }
})();

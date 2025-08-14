function ttsSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function ttsSpeakFromElement(el, { lang = "de-DE", rate = 0.95, pitch = 1 } = {}) {
  if (!ttsSupported() || !el) return;
  const text = el.innerText || el.textContent || "";
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  u.pitch = pitch;
  window.speechSynthesis.cancel(); // reset queue
  window.speechSynthesis.speak(u);
}

function ttsStop() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

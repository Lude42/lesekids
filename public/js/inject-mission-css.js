function injectMissionControlCSS() {
  if (window.__LK_CONSOLE_CSS__) return;
  window.__LK_CONSOLE_CSS__ = true;

  const css = `
    .lk-console {
      box-sizing: border-box;
      max-width: 750px;
      margin: 1.25rem auto 0;
      padding: 1rem;
      background: #0b1220;
      border: 1px solid #162033;
      border-radius: 12px;
      color: #c8f7e0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto;
    }

    .lk-title-mini {
      font-weight: 700;
      font-size: 1rem;
      letter-spacing: .06em;
      text-transform: uppercase;
      margin: 0 0 .6rem 0;
      color: #7fdcb8;
    }

    .lk-status {
      display: flex;
      gap: .5rem;
      margin-bottom: .6rem;
    }

    .lk-led {
      width: .8rem;
      height: .8rem;
      border-radius: 50%;
      display: inline-block;
    }
    .lk-led--ok { background: #1df2a0; }
    .lk-led--link { background: #57b6ff; }
    .lk-led--power { background: #ffc857; }

    .lk-card {
      background: #091225;
      border: 1px solid #162033;
      border-radius: 10px;
      padding: .9rem;
      margin-top: .5rem;
    }

    .lk-card-title {
      font-weight: 600;
      font-size: .95rem;
      color: #9adfc5;
      margin: 0 0 .6rem 0;
    }

    .lk-readouts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: .6rem .8rem;
    }

    .lk-readouts > div {
      padding: .5rem .6rem;
      border: 1px solid #162033;
      border-radius: 8px;
      background: #070b14;
    }

    .lk-readouts dt {
      font-size: .75rem;
      color: #9adfc5;
      margin-bottom: .25rem;
    }

    .lk-readouts dd {
      margin: 0;
      font-weight: 700;
      font-size: 1rem;
      color: #c8f7e0;
    }

    .lk-alert {
      margin-top: .9rem;
      background: #101a30;
      border: 1px solid #162033;
      border-radius: 10px;
      padding: .9rem 1rem;
    }

    .lk-alert h4 {
      margin: .1rem 0 .35rem 0;
      font-weight: 700;
      font-size: .95rem;
      color: #7fdcb8;
    }

    .lk-alert p {
      margin: .25rem 0 0 0;
      font-size: .9rem;
      color: #c8f7e0;
    }

    .lk-alert.is-locked { border-color: #35527a; }
    .lk-alert.is-done   { border-color: #3b7a5f; }

    .lk-alert .lk-chip {
      display: inline-block;
      margin-left: .25rem;
      font-weight: 700;
      font-size: .72rem;
      padding: .2rem .4rem;
      border-radius: 6px;
      border: 1px solid #162033;
      background: #0a1426;
      color: #9adfc5;
    }
  `;

  const style = document.createElement("style");
  style.id = "lk-console-css";
  style.textContent = css;
  document.head.appendChild(style);
}

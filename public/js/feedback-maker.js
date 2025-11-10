function makeFeedbackNode(selectedItems) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: function () {
      const last = jsPsych.data.get().last(1).values()[0] || {};
      const isMC = last.question_type === "mc";
      const isOpen = last.question_type === "open";

      // ⏱️ zu schnell geantwortet
      if (last.rt_fast) {
        return `
          <p>⚠️ Warnung. Du kommst vom Kurs ab.</p>
          <p style="color:orange;">Bitte nimm dir Zeit, lies genau, und antworte erst dann.</p>
        `;
      }

      // Item-Objekt für Feedback finden
      const itemObj = window.items.find((i) => i.item === last.item) || {};
      const explainHtml = itemObj.explain
        ? `<div class="card">ℹ️ ${typeof escapeHtml === "function"
            ? escapeHtml(itemObj.explain)
            : itemObj.explain}</div>`
        : "";

      // --- Multiple Choice Feedback ---
      if (isMC) {
        if (last.correct) {
          const fbText = last.chosen_feedback;
          const fbHtml = fbText
            ? `<div class="card">ℹ️ ${typeof escapeHtml === "function"
                ? escapeHtml(fbText)
                : fbText}</div>`
            : "";

          const fuelSteps = Math.min(90, Math.floor(last.points_awarded));
          const fuelHtml = renderFuelGridHTML(fuelSteps);

          return `
            <p>✅ Erfolg!</p>
            ${fbHtml}
            <p>Du bekommst <b>${last.points_awarded}</b> Plasma-Treibstoff für die Aufgabe!</p>
            ${fuelHtml}
            <p>Insgesamt hast du <b>${totalPoints}</b> Plasma-Treibstoff</p>
            <p>Erledigte Aufgaben: <b>${tasksCompleted} von ${selectedItems.length}</b></p>
          `;
        }

        if (last.show_explain) {
          const corIdx = Number.isInteger(itemObj.cor) ? itemObj.cor : null;
          const correctText =
            corIdx !== null && Array.isArray(itemObj.opt)
              ? itemObj.opt[corIdx]
              : "—";
          return `
            <p>⛔</p>
            <p>Die richtige Antwort ist: <b>${typeof escapeHtml === "function"
              ? escapeHtml(correctText)
              : correctText}</b></p>
            ${explainHtml}
            <p>Es geht jetzt weiter mit einer anderen Aufgabe</p>
          `;
        }

        const fbText = last.chosen_feedback;
        return fbText
          ? `<div class="card">⛔ ${typeof escapeHtml === "function"
              ? escapeHtml(fbText)
              : fbText}</div>
             <p>Du erhältst jetzt eine Hilfe für diese Aufgabe.</p>`
          : `<p>⛔ Leider falsch. Du bekommst jetzt eine Hilfe.</p>`;
      }

      // --- Offene Aufgaben Feedback ---
      if (isOpen) {
        const typed = last.text_response
          ? (typeof escapeHtml === "function"
              ? escapeHtml(last.text_response)
              : last.text_response)
          : "";

        const rationale = (last.llm_rationale || "").trim();
        const rationaleHtml = rationale
          ? `<div class="card">ℹ️ ${typeof escapeHtml === "function"
              ? escapeHtml(rationale)
              : rationale}</div>`
          : "";

        const fuelSteps = Math.min(90, Math.floor(last.points_awarded));
        const fuelHtml = renderFuelGridHTML(fuelSteps);

        if (last.correct) {
          return `
            <p>✅ Erfolg!</p>
            ${rationaleHtml}
            <p>Du bekommst <b>${last.points_awarded}</b> Plasma-Treibstoff für die Aufgabe!</p>
            ${fuelHtml}
            <p>Insgesamt hast du <b>${totalPoints}</b> Plasma-Treibstoff</p>
            <p>Erledigte Aufgaben: <b>${tasksCompleted} von ${selectedItems.length}</b></p>
          `;
        }

        if (last.show_explain) {
          return `
            <p>⛔ Das war leider nicht korrekt.</p>
            <p>Deine Antwort: „${typed}“</p>
            ${explainHtml}
            <p>Es geht mit einer anderen Aufgabe weiter.</p>
          `;
        }

        return `
          <p>⛔ Das passt noch nicht.</p>
          <p>Deine Antwort war: „${typed}“</p>
          ${rationaleHtml}
          <p>Du bekommst jetzt eine Hilfe, versuch es nochmal.</p>
        `;
      }

      // Default fallback
      return `<p>Weiter</p>`;
    },
    choices: ["Weiter 🚀"],
    on_finish: (d) => (d.stimulus = -2),
    data: function () {
      const last = jsPsych.data.get().last(1).values()[0] || {};
      return {
        type: 2,
        question_type: last.question_type ?? null,
      };
    },
  };
}
	
function encodeLikert(r, keys, maxPerKey) {
  const out = {};
  for (const k of keys) {
    const v = r[k];
    const n = v === undefined || v === null ? null : Number(v);
    out[k] = Number.isFinite(n) ? n + 1 : null; // 1..K
    if (maxPerKey && out[k] !== null && out[k] > maxPerKey) out[k] = maxPerKey;
  }
  return out;
}

const saveMotivationDailyBlock = {
  type: jsPsychCallFunction,
  async: true,
  func: async (done) => {
    try {
      const likerts = jsPsych.data.get().filter({trial_type: "survey-likert"}).values();
      const rMov1 = likerts[0]?.response ?? {};
      const rMov2 = likerts[1]?.response ?? {};
      const rLsk  = likerts[2]?.response ?? {};
      const rLbvh = likerts[3]?.response ?? {};

      const mov1Enc = encodeLikert(rMov1, ['mov11','mov12','mov13','mov14','mov15','mov16','mov17','mov18']);
      const mov2Enc = encodeLikert(rMov2, ['mov21','mov22','mov23','mov24','mov25','mov26','mov27','mov28']);
      const lskEnc  = encodeLikert(rLsk,  ['lsk1','lsk2','lsk3','lsk4','lsk5','lsk6','lsk7','lsk8']);
      const lbvhEnc = encodeLikert(rLbvh, ['lbvh1','lbvh2','lbvh3','lbvh4']); // ACHTUNG: name 'lbvh3' im Item!

      const payload = { subject_id, ...mov1Enc, ...mov2Enc, ...lskEnc, ...lbvhEnc };

      const res = await fetch(`/api/motivation-daily`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
      });

      if (res.status === 409) {
        // heute schon vorhanden – ok
      } else if (!res.ok) {
        const t = await res.text().catch(()=> "");
        throw new Error(`Motivation daily speichern fehlgeschlagen (${res.status}): ${t}`);
      }

      localStorage.setItem(getMotivationTodayLSKey(subject_id), "1");
      done();
    } catch (e) {
      console.error(e);
      done();
    }
  }
};

// Skalen
const Zustimmung = ["(0) überhaupt nicht", "(1) wenig", "(2) einigermaßen", "(3) stark", "(4) sehr stark"];
const Haeufigkeit = ["(0) Nie oder fast nie","(1) Ein- bis zweimal pro Monat","(2) Ein- bis zweimal die Woche","(3) Jeden Tag oder fast jeden Tag"];

const header5 = `
  <div class="lk-likert-header" style="--lk-cols:5;">
    <div></div>
    ${Zustimmung.map(l => `<div>${l}</div>`).join("")}
  </div>
`;

const header4 = `
  <div class="lk-likert-header" style="--lk-cols:4;">
    <div></div> 
    ${Haeufigkeit.map(l => `<div>${l}</div>`).join("")}
  </div>
`;



// Nach den Demo-Blöcken einfügen:

const mov1 = {
  type: jsPsychSurveyLikert,
  css_classes: ["lk-matrix","lk-cols-5","lk-hide-cell-labels","lk-compact"],
  preamble: `<h3>Wie sehr stimmst du den Aussagen zu?</h3>${header5}`,
  button_label: "Weiter >",
  randomize_question_order: false,
  questions: [
    {prompt: "Ich mag Lesen wirklich.", name: 'mov11', labels: Zustimmung, required: true},
    {prompt: "Es macht mir Spaß zu lesen.", name: 'mov12', labels: Zustimmung, required: true},
    {prompt: "Ich lese gerne.", name: 'mov13', labels: Zustimmung, required: true},
    {prompt: "Ich finde Lesen faszinierend.", name: 'mov14', labels: Zustimmung, required: true},
    {prompt: "Ich finde Lesen interessant.", name: 'mov15', labels: Zustimmung, required: true},
    {prompt: "Ich finde Lesen sinnvoll.", name: 'mov16', labels: Zustimmung, required: true},
    {prompt: "Es ist für mich sehr nützlich zu lesen.", name: 'mov17', labels: Zustimmung, required: true},
    {prompt: "Es ist mir wichtig zu lesen.", name: 'mov18', labels: Zustimmung, required: true}
  ]
};

const mov2 = {
  type: jsPsychSurveyLikert,
  css_classes: ["lk-matrix","lk-cols-5","lk-hide-cell-labels","lk-compact"],
  preamble: `<h3>Wie sehr stimmst du den Aussagen zu?</h3>${header5}`,  // header5 nutzt --lk-cols:5
  button_label: "Weiter >",
  randomize_question_order: false,
  questions: [
    {prompt: "Ich werde mich schämen, wenn ich nicht lese.", name: 'mov21', labels: Zustimmung, required: true},
    {prompt: "Ich möchte andere nicht enttäuschen.", name: 'mov22', labels: Zustimmung, required: true},
    {prompt: "Ich werde Schuldgefühle haben, wenn ich es nicht tue.", name: 'mov23', labels: Zustimmung, required: true},
    {prompt: "Ich muss mir selbst beweisen, dass ich gute Noten im Lesen bekommen kann.", name: 'mov24', labels: Zustimmung, required: true},
    {prompt: "Ich kann nur stolz auf mich sein, wenn ich gute Noten im Lesen bekomme.", name: 'mov25', labels: Zustimmung, required: true},
    {prompt: "Andere denken, dass ich es tun muss.", name: 'mov26', labels: Zustimmung, required: true},
    {prompt: "Andere werden mich nur belohnen, wenn ich lese.", name: 'mov27', labels: Zustimmung, required: true},
    {prompt: "Andere werden mich bestrafen, wenn ich nicht lese.", name: 'mov28', labels: Zustimmung, required: true}
  ]
};

const lsk = {
  type: jsPsychSurveyLikert,
  css_classes: ["lk-matrix","lk-cols-5","lk-hide-cell-labels","lk-compact"],
  preamble: `<h3>Wie gut liest du?</h3>${header5}`,
  button_label: "Weiter >",
  randomize_question_order: false,
  questions: [
    {prompt: "Normalerweise bin ich gut im Lesen.", name: 'lsk1', labels: Zustimmung, required: true},
    {prompt: "Lesen ist einfacher für mich als alle anderen Fächer.", name: 'lsk2', labels: Zustimmung, required: true},
    {prompt: "Lesen fällt mir schwerer als vielen meiner Mitschülerinnen und Mitschüler.", name: 'lsk3', labels: Zustimmung, required: true},
    {prompt: "Ich bin einfach nicht gut im Lesen.", name: 'lsk4', labels: Zustimmung, required: true},
    {prompt: "Ich lese schnell.", name: 'lsk5', labels: Zustimmung, required: true},
    {prompt: "Ich verstehe das meiste, was ich lese.", name: 'lsk6', labels: Zustimmung, required: true},
    {prompt: "Lesen fällt mir sehr leicht.", name: 'lsk7', labels: Zustimmung, required: true},
    {prompt: "Es fällt mir schwer, schwierige Wörter zu lesen.", name: 'lsk8', labels: Zustimmung, required: true}
  ]
};

const lbvh = {
  type: jsPsychSurveyLikert,
  css_classes: ["lk-matrix","lk-cols-4","lk-hide-cell-labels","lk-compact"],
  preamble: `<h3>Wie oft liest du <b>außerhalb</b> der Schule?</h3>${header4}`,
  button_label: "Weiter >",
  randomize_question_order: false,
  questions: [
    {prompt: "Ich lese, weil es mir Spaß macht.", name: 'lbvh1', labels: Haeufigkeit, required: true},
    {prompt: "Ich lese, um neue Sachen zu erfahren.", name: 'lbvh2', labels: Haeufigkeit, required: true},
    {prompt: "Ich lese Bücher.", name: 'lbvh3', labels: Haeufigkeit, required: true},
    {prompt: "Ich lese vor dem Einschlafen.", name: 'lbvh4', labels: Haeufigkeit, required: true}
  ]
};


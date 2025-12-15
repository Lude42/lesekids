function mapDemoResponses(r1, r2, r3, r4) {
  const mapGen = { "Mädchen": 1, "Junge": 2, "Anderes": 3 };
  const mapMon = {
    "Januar": 1, "Februar": 2, "März": 3, "April": 4, "Mai": 5, "Juni": 6,
    "Juli": 7, "August": 8, "September": 9, "Oktober": 10, "November": 11, "Dezember": 12
  };
  const mapJhr = { "vor 2011": 9998, "2011": 2011, "2012": 2012, "2013": 2013,
                   "2014": 2014, "2015": 2015, "2016": 2016, "2017": 2017, "2018": 2018, 
                   "2019": 2019,
                   "nach 2019": 9999 };
  const mapLng = {
    "Ich spreche zu Hause <b>immer</b> Deutsch.": 1,
    "Ich spreche zu Hause <b>fast immer</b>  Deutsch.": 2,
    "Ich spreche zu Hause <b>manchmal Deutsch</b> und manchmal eine andere Sprache.": 3,
    "Ich spreche zu Hause <b>niemals</b> Deutsch.": 4
  };
  const mapMsr = {
    "Deutsch ist meine Muttersprache.": 1,
    "Deutsch ist nicht meine Muttersprache, aber ich habe Deutsch gelernt, bevor ich in die Schule gekommen bin.": 2,
    "Deutsch ist nicht meine Muttersprache und ich habe erst Deutsch gelernt, nachdem ich in die Schule gekommen bin.": 3
  };
  const mapBok = {
    "Keine oder nur sehr wenige (0-10)<img src='img/book10.png' alt='10 buecher' width='1000'>": 1,
    "Genug, um ein Regalbrett zu füllen (11-25)<img src='img/book25.png' alt='25 buecher' width='1000'>": 2,
    "Genug, um ein Regal zu füllen (26-100)<img src='img/book100.png' alt='100 buecher' width='1000'>": 3,
    "Genug, um zwei Regale zu füllen (101-200 Bücher)<img src='img/book200.png' alt='200 buecher' width='1000'>": 4,
    "Genug, um drei oder mehr Regale zu füllen (über 200 Bücher)<img src='img/booku200.png' alt='>200 buecher' width='1000'>": 5
  };

  return {
    gen: mapGen[r1.gen] ?? null,
    mon: mapMon[r1.mon] ?? null,
    jhr: mapJhr[r1.jhr] ?? null,
    lng: mapLng[r2.lng] ?? null,
    msr: mapMsr[r2.msr] ?? null,
    bok: mapBok[r3.bok] ?? null,
    po1: r4.po1 === "ja" ? 2 : r4.po1 === "nein" ? 1 : null,
    po2: r4.po2 === "ja" ? 2 : r4.po2 === "nein" ? 1 : null,
    po3: r4.po3 === "ja" ? 2 : r4.po3 === "nein" ? 1 : null,
    po4: r4.po4 === "ja" ? 2 : r4.po4 === "nein" ? 1 : null,
  };
}


// ---------- Deine drei Demoblöcke ----------

function createOnboardStimulus(title, text, imgPath) {
  return `
    <div class="container">
      <div class="text">
        <h3>${title}</h3>
        <p>${text}</p>
      </div>
      <div class="image">
        <img src="${imgPath}" alt="Onboarding Bild">
      </div>
    </div>
  `;
}

// ✅ Trials definieren
const onboard1 = {
  type: jsPsychHtmlButtonResponse,
  stimulus: createOnboardStimulus(
    "Willkommen zur LeseKI:DS Weltraum Mission",
    "Wir starten jetzt deine Mission.",
    "img/lesekids_logo.png"
  ),
  choices: ["Weiter 🚀"],
};

const onboard2 = {
  type: jsPsychHtmlButtonResponse,
  stimulus: createOnboardStimulus(
    "Suche nach einer Lesebasis",
    "Wir sind auf der Suche nach der geheimnisvollen Lesebasis. Dort bekommt man Einblick in das Leben der Menschen, was sie Denken und warum sie Dinge machen.",
    "img/onboard1.png"
  ),
  choices: ["Weiter 🚀"],
};


const onboard3 = {
  type: jsPsychHtmlButtonResponse,
  stimulus: createOnboardStimulus(
    "Wir brauchen Plasmatreibstoff",
    "Du sammelst Plasmatreibstoff, indem du Leserätsel löst. Je schwieriger das Rätsel desto mehr Plasmatreibstoff bringen sie.",
    "img/onboard2.png"
  ),
  choices: ["Weiter 🚀"],
};

const onboard4 = {
  type: jsPsychHtmlButtonResponse,
  stimulus: createOnboardStimulus(
    "Dein Boardcomputer hilft",
    "Wenn du nicht weiter weißt bekommst du Tipps: Was wichtig ist, was Wörter bedeuten und woran man denken muss.",
    "img/onboard3.png"
  ),
  choices: ["Weiter 🚀"],
};

const onboard5 = {
  type: jsPsychHtmlButtonResponse,
  stimulus: createOnboardStimulus(
    "Bevor es losgehen kann",
    "Der Boardcomputer will ein paar Dinge über dich wissen, damit er dir gut helfen kann. Danach wird Plasmatreibstoff gesammelt!",
    "img/onboard4.png"
  ),
  choices: ["Weiter 🚀"],
};

const demo1 = {
  type: jsPsychSurveyMultiChoice,
  button_label: "Weiter >",
  preamble: "<h3>Über dich</h3>",
  questions: [
    {
      prompt: "<p align='left'>Welche dieser Beschreibungen trifft auf dich zu?",
      options: ["Mädchen", "Junge", "Anderes"],
      horizontal: true,
      required: true,
      name: "gen",
    },
    {
      prompt: "<p align='left'>In welchem Monat bist du geboren?",
      options: [
        "Januar","Februar","März","April","Mai","Juni","Juli",
        "August","September","Oktober","November","Dezember"
      ],
      horizontal: true,
      required: true,
      name: "mon",
    },
    {
      prompt: "<p align='left'>In welchem Jahr bist du geboren?",
      options: ["vor 2011","2011","2012","2013","2014","2015","2016","2017","2018", "2019","nach 2019"],
      horizontal: true,
      required: true,
      name: "jhr",
    },
  ],
  randomize_question_order: false,
  data: { type: 0, question_type: "demo", stimulus: -79 }
};

const demo2 = {
  type: jsPsychSurveyMultiChoice,
  button_label: "Weiter >",
  preamble: "<h3>Über dich</h3>",
  questions: [
    {
      prompt: "<p align='left'>Wie oft sprichst du zu Hause Deutsch?",
      options: [
        "Ich spreche zu Hause <b>immer</b> Deutsch.",
        "Ich spreche zu Hause <b>fast immer</b>  Deutsch.",
        "Ich spreche zu Hause <b>manchmal Deutsch</b> und manchmal eine andere Sprache.",
        "Ich spreche zu Hause <b>niemals</b> Deutsch.",
      ],
      horizontal: false,
      required: true,
      name: "lng",
    },
    {
      prompt: "<p align='left'>Welche der folgenden Aussagen trifft auf dich zu?",
      options: [
        "Deutsch ist meine Muttersprache.",
        "Deutsch ist nicht meine Muttersprache, aber ich habe Deutsch gelernt, bevor ich in die Schule gekommen bin.",
        "Deutsch ist nicht meine Muttersprache und ich habe erst Deutsch gelernt, nachdem ich in die Schule gekommen bin.",
      ],
      horizontal: false,
      required: true,
      name: "msr",
    },
  ],

  randomize_question_order: false,
  data: { type: 0, question_type: "demo", stimulus: -79 }
};

const demo3 = {
  type: jsPsychSurveyMultiChoice,
  button_label: "Weiter >",
  preamble: "<h3>Was gibt es bei dir zu Hause?</h3>",
  questions: [
    {
      prompt:
        "<p align='left'>Wie viele Bücher gibt es bei dir zu Hause ungefähr? <br> (Zähle nicht mit: Zeitschriften, Zeitungen und deine Schulbücher)",
      options: [
        "Keine oder nur sehr wenige (0-10)<img src='img/book10.png' alt='10 buecher' width='1000'>",
        "Genug, um ein regalbrett zu füllen (11-25)<img src='img/book25.png' alt='25 buecher' width='1000'>",
        "Genug, um ein Regal zu füllen (26-100)<img src='img/book100.png' alt='100 buecher' width='1000'>",
        "Genug, um zwei Regale zu füllen (101-200 Bücher)<img src='img/book200.png' alt='200 buecher' width='1000'>",
        "Genug, um drei oder mehr Regale zu füllen (über 200 Bücher)<img src='img/booku200.png' alt='>200 buecher' width='1000'>",
      ],
      horizontal: false,
      required: true,
      name: "bok",
    },
  ],
  randomize_question_order: false,
	data: { type: 0, question_type: "demo", stimulus: -79 }
};

const demo4 = {
  type: jsPsychSurveyMultiChoice,
  button_label: "Weiter >",
  preamble: "<h3>Was gibt es bei dir zu Hause?</h3>",
  questions: [
    {
      prompt: "<p align='left'>Hast du einen <b>Schreibtisch</b> oder einen anderen Tisch nur für dich zu Hause?",
      options: ["nein", "ja"],
      horizontal: true,
      required: true,
      name: "po1",
    },
    {
      prompt: "<p align='left'>Hast du ein <b>eigenes Zimmer</b> zu Hause?",
      options: ["nein", "ja"],
      horizontal: true,
      required: true,
      name: "po2",
    },
    {
      prompt: "<p align='left'>Gibt es einen <b>Rasenmäher</b> bei dir zu Hause?",
      options: ["nein", "ja"],
      horizontal: true,
      required: true,
      name: "po3",
    },
    {
      prompt: "<p align='left'>Gibt es <b>zwei oder mehr Autos</b> bei dir zu Hause?",
      options: ["nein", "ja"],
      horizontal: true,
      required: true,
      name: "po4",
    }
  ],
  randomize_question_order: false,data: { type: 0, question_type: "demo", stimulus: -79 }

};
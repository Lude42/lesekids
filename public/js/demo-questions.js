function mapDemoResponses(r1, r2, r3) {
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
    "Genug, um ein regalbrett zu füllen (11-25)<img src='img/book25.png' alt='25 buecher' width='1000'>": 2,
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
    po1: r3.po1 === "ja" ? 2 : r3.po1 === "nein" ? 1 : null,
    po2: r3.po2 === "ja" ? 2 : r3.po2 === "nein" ? 1 : null,
    po3: r3.po3 === "ja" ? 2 : r3.po3 === "nein" ? 1 : null,
    po4: r3.po4 === "ja" ? 2 : r3.po4 === "nein" ? 1 : null,
  };
}


// ---------- Deine drei Demoblöcke ----------
const demo1 = {
  type: jsPsychSurveyMultiChoice,
  button_label: "Weiter >",
  preamble: "<h3>Über dich</h3>",
  questions: [
    {
      prompt: "Welche dieser Beschreibungen trifft auf dich zu?",
      options: ["Mädchen", "Junge", "Anderes"],
      horizontal: true,
      required: true,
      name: "gen",
    },
    {
      prompt: "In welchem Monat bist du geboren?",
      options: [
        "Januar","Februar","März","April","Mai","Juni","Juli",
        "August","September","Oktober","November","Dezember"
      ],
      horizontal: true,
      required: true,
      name: "mon",
    },
    {
      prompt: "In welchem Jahr bist du geboren?",
      options: ["vor 2011","2011","2012","2013","2014","2015","2016","2017","2018", "2019","nach 2019"],
      horizontal: true,
      required: true,
      name: "jhr",
    },
  ],
  randomize_question_order: false,
};

const demo2 = {
  type: jsPsychSurveyMultiChoice,
  button_label: "Weiter >",
  preamble: "<h3>Über dich</h3>",
  questions: [
    {
      prompt: "Wie oft sprichst du zu Hause Deutsch?",
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
      prompt: "Welche der folgenden Aussagen trifft auf dich zu?",
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
};

const demo3 = {
  type: jsPsychSurveyMultiChoice,
  button_label: "Weiter >",
  preamble: "<h3>Was gibt es bei dir zu Hause?</h3>",
  questions: [
    {
      prompt:
        "Wie viele Bücher gibt es bei dir zu Hause ungefähr? <br> (Zähle nicht mit: Zeitschriften, Zeitungen und deine Schulbücher)",
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
    {
      prompt: "Hast du einen <b>Schreibtisch</b> oder einen anderen Tisch nur für dich zu Hause?",
      options: ["ja", "nein"],
      horizontal: true,
      required: true,
      name: "po1",
    },
    {
      prompt: "Hast du ein <b>eigenes Zimmer</b> zu Hause?",
      options: ["ja", "nein"],
      horizontal: true,
      required: true,
      name: "po2",
    },
    {
      prompt: "Gibt es einen <b>Rasenmäher</b> bei dir zu Hause?",
      options: ["ja", "nein"],
      horizontal: true,
      required: true,
      name: "po3",
    },
    {
      prompt: "Gibt es <b>zwei oder mehr Autos</b> bei dir zu Hause?",
      options: ["ja", "nein"],
      horizontal: true,
      required: true,
      name: "po4",
    },
  ],
  randomize_question_order: false,
};

const instructions3 = {
  type: jsPsychInstructions,
  pages: ["Super, vielen Dank!"],
  button_label_next: "Weiter",
  button_label_previous: "Zurück",
  show_clickable_nav: true,
};
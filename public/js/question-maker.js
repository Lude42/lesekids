function makeQuestionTrial(item) {
  const isOpen = item.type === "open";
  let repeats = 0;
  let selectedAlt = null;

  // Stimulus-Ausgabe (je nach Versuch/Repetition)
  const stimulusHtml = function () {
    if (repeats === 0) {
      selectedAlt = null;
      return item.que;
    }

    if (!selectedAlt) selectedAlt = Math.random() < 0.5 ? "a" : "b";
    const html = selectedAlt === "a" ? item.que2a : item.que2b;

    if (selectedAlt === "a") {
      return `
        <div id="tts-audio" style="display:flex; gap:.5rem; align-items:center; margin-bottom:.5rem;"></div>
        <div id="tts-content">${html}</div>
      `;
    }

    return `
      <div class="card">${item.tbar || ""}</div>
      <div id="tts-content">${html}</div>
    `;
  };

  // Multiple-Choice Items
  if (!isOpen) {
    const maxAttempts = 2;
    return {
      type: jsPsychHtmlButtonResponse,
      stimulus: stimulusHtml,
      choices: item.opt,
      css_classes: ["test-item"],
      data: {
        type: 1,
        item: item.item,
        correct_response: item.cor,
        question_type: "mc",
      },
      on_load: function () {
        if (repeats > 0 && selectedAlt === "a") {
          renderFeedbackAudio({ item: item.item, mountId: "tts-audio" });
        }
      },
      on_finish: function (data) {
        const threshold = repeats === 0 ? item.first_threshold : 1000;
        data.rt_fast = data.rt < threshold;

        const idx = Number.isFinite(parseInt(data.response, 10))
          ? parseInt(data.response, 10)
          : null;

        data.chosen_index = idx;
        data.chosen_text =
          idx !== null && Array.isArray(item.opt) ? item.opt[idx] : null;
        data.fb_array = Array.isArray(item.fb) ? item.fb : null;
        data.chosen_feedback =
          data.fb_array && idx !== null ? data.fb_array[idx] : null;

        data.correct = data.response == data.correct_response;
        data.repetition = repeats;

        if (data.correct && !data.rt_fast) {
          if (repeats === 0) {
            data.score = 2;
            data.points_awarded = item.points_first_try;
          } else if (repeats === 1) {
            data.score = 1;
            data.points_awarded = item.points_later_try;
          } else {
            data.score = 0;
            data.points_awarded = 0;
          }
        } else {
          data.score = 0;
          data.points_awarded = 0;
        }

        if (!data.rt_fast && !data.correct) {
          repeats++;
          if (repeats >= maxAttempts) data.show_explain = true;
        }

        if (data.score > 0) {
          totalPoints += data.points_awarded;
          tasksCompleted++;
          scoredItems.push({
            thresholds: [item.threshold_1, item.threshold_2],
            score: data.score,
          });
        }

        data.stimulus =
          data.repetition === 0
            ? -41
            : selectedAlt === "a"
            ? -42
            : -43;
        data.total_points = totalPoints;
        data.tasks_completed = tasksCompleted;
      },
    };
  }

  // Offene Items
  return {
    type: jsPsychSurveyText,
    preamble: stimulusHtml,
    questions: [
      {
        prompt: "",
        rows: 1,
        columns: 40,
        required: true,
        name: "ans",
        placeholder: "Deine Antwort",
      },
    ],
    button_label: "Abgeben ✍",
    data: { type: 1, item: item.item, question_type: "open" },
    on_load: function () {
      if (repeats > 0 && selectedAlt === "a") {
        renderFeedbackAudio({ item: item.item, mountId: "tts-audio" });
      }
    },
    on_finish: async function (data) {
      const raw =
        data.response && (data.response.ans ?? data.response.Q0 ?? "");
      data.text_response = (raw ?? "").toString();

      const threshold = repeats === 0 ? item.first_threshold : 1000;
      data.rt_fast = data.rt < threshold;
      data.repetition = repeats;

      const result = await scoreWithLLM({
        questionHtml:
          repeats === 0
            ? item.que
            : selectedAlt === "a"
            ? item.que2a
            : item.que2b,
        studentAnswer: data.text_response,
        item,
      });

      data.llm_source = result.source;
      data.llm_rationale = result.rationale;
      data.normalized_answer = result.normalized_answer;
      data.correct = !!result.is_correct;

      if (data.correct && !data.rt_fast) {
        if (repeats === 0) {
          data.score = 2;
          data.points_awarded = item.points_first_try;
        } else if (repeats === 1) {
          data.score = 1;
          data.points_awarded = item.points_later_try;
        } else {
          data.score = 0;
          data.points_awarded = 0;
        }
      } else {
        data.score = 0;
        data.points_awarded = 0;
      }

      const maxAttempts = 2;
      if (!data.rt_fast && !data.correct) {
        repeats++;
        if (repeats >= maxAttempts) data.show_explain = true;
      }

      if (data.score > 0) {
        totalPoints += data.points_awarded;
        tasksCompleted++;
        scoredItems.push({
          thresholds: [item.threshold_1, item.threshold_2],
          score: data.score,
        });
      }

      data.stimulus =
        data.repetition === 0
          ? -41
          : selectedAlt === "a"
          ? -42
          : -43;
      data.total_points = totalPoints;
      data.tasks_completed = tasksCompleted;
    },
  };
}

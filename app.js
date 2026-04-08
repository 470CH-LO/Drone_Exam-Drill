(function () {
  const STORAGE_KEY = "drone-exam-practice-progress";
  const questionBank = window.QUESTION_BANK;

  const state = {
    progress: loadProgress(),
    queue: [],
    sessionIndex: 0,
    answered: 0,
    correct: 0,
    currentQuestion: null,
    hasSubmitted: false,
  };

  const elements = {
    chapterList: document.getElementById("chapter-list"),
    chapterStats: document.getElementById("chapter-stats"),
    practiceMode: document.getElementById("practice-mode"),
    questionOrder: document.getElementById("question-order"),
    startSession: document.getElementById("start-session"),
    clearProgress: document.getElementById("clear-progress"),
    datasetMeta: document.getElementById("dataset-meta"),
    sessionTitle: document.getElementById("session-title"),
    sessionSummary: document.getElementById("session-summary"),
    progressValue: document.getElementById("progress-value"),
    accuracyValue: document.getElementById("accuracy-value"),
    wrongTotalValue: document.getElementById("wrong-total-value"),
    emptyState: document.getElementById("empty-state"),
    quizCard: document.getElementById("quiz-card"),
    questionPosition: document.getElementById("question-position"),
    questionChapter: document.getElementById("question-chapter"),
    questionBadge: document.getElementById("question-badge"),
    questionText: document.getElementById("question-text"),
    optionsForm: document.getElementById("options-form"),
    answerFeedback: document.getElementById("answer-feedback"),
    submitAnswer: document.getElementById("submit-answer"),
    nextQuestion: document.getElementById("next-question"),
    retryWrong: document.getElementById("retry-wrong"),
  };

  if (!questionBank || !Array.isArray(questionBank.chapters) || !questionBank.chapters.length) {
    elements.datasetMeta.textContent = "找不到題庫資料，請先執行轉檔腳本。";
    elements.sessionSummary.textContent = "請在專案根目錄執行 scripts/extract-question-bank.ps1。";
    elements.startSession.disabled = true;
    return;
  }

  bootstrap();

  function bootstrap() {
    elements.datasetMeta.textContent = `${questionBank.title}，共 ${questionBank.meta.totalQuestions} 題。最近更新：${questionBank.meta.updatedAt}`;
    renderChapterFilters();
    renderChapterStats();
    updateSummary();

    elements.startSession.addEventListener("click", startSession);
    elements.clearProgress.addEventListener("click", clearProgress);
    elements.submitAnswer.addEventListener("click", submitCurrentAnswer);
    elements.nextQuestion.addEventListener("click", goToNextQuestion);
    elements.retryWrong.addEventListener("click", switchToWrongMode);
  }

  function renderChapterFilters() {
    elements.chapterList.innerHTML = "";

    questionBank.chapters.forEach((chapter) => {
      const wrapper = document.createElement("label");
      wrapper.className = "chapter-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = chapter.id;
      checkbox.checked = true;

      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = chapter.name;
      const desc = document.createElement("span");
      const wrongCount = chapter.questions.filter((question) => isWrongQuestion(question.id)).length;
      desc.textContent = `${chapter.questions.length} 題，累積錯題 ${wrongCount} 題`;

      copy.append(title, desc);
      wrapper.append(checkbox, copy);
      elements.chapterList.append(wrapper);
    });
  }

  function renderChapterStats() {
    elements.chapterStats.innerHTML = "";

    questionBank.chapters.forEach((chapter) => {
      const questions = chapter.questions;
      const answered = questions.filter((question) => getQuestionProgress(question.id).attempts > 0).length;
      const wrong = questions.filter((question) => isWrongQuestion(question.id)).length;

      const card = document.createElement("article");
      card.className = "stat-card";
      card.innerHTML = `
        <strong>${chapter.name}</strong>
        <span>已作答 ${answered} / ${questions.length}</span>
        <span>錯題保留 ${wrong} 題</span>
      `;
      elements.chapterStats.append(card);
    });
  }

  function startSession() {
    const selectedChapterIds = getSelectedChapterIds();
    const mode = elements.practiceMode.value;
    const order = elements.questionOrder.value;

    const selectedQuestions = questionBank.chapters
      .filter((chapter) => selectedChapterIds.includes(chapter.id))
      .flatMap((chapter) => chapter.questions);

    const filteredQuestions = selectedQuestions.filter((question) => {
      const progress = getQuestionProgress(question.id);

      if (mode === "wrong") {
        return progress.lastResult === "wrong";
      }

      if (mode === "unanswered") {
        return progress.attempts === 0;
      }

      if (mode === "incorrectly-answered") {
        return progress.wrongCount > 0;
      }

      return true;
    });

    state.queue = order === "random" ? shuffle(filteredQuestions) : [...filteredQuestions];
    state.sessionIndex = 0;
    state.answered = 0;
    state.correct = 0;
    state.currentQuestion = null;
    state.hasSubmitted = false;

    if (!state.queue.length) {
      elements.emptyState.classList.remove("hidden");
      elements.quizCard.classList.add("hidden");
      elements.sessionTitle.textContent = "沒有符合條件的題目";
      elements.sessionSummary.textContent = "請改選其他章節，或先做過一輪題目後再使用錯題模式。";
      updateSummary();
      return;
    }

    elements.emptyState.classList.add("hidden");
    elements.quizCard.classList.remove("hidden");
    elements.sessionTitle.textContent = buildSessionTitle(selectedChapterIds, mode);
    elements.sessionSummary.textContent = `本輪共 ${state.queue.length} 題。作答後會立即顯示正確答案與選項內容。`;
    renderCurrentQuestion();
  }

  function renderCurrentQuestion() {
    const question = state.queue[state.sessionIndex];

    if (!question) {
      finishSession();
      return;
    }

    state.currentQuestion = question;
    state.hasSubmitted = false;
    elements.answerFeedback.className = "answer-feedback hidden";
    elements.answerFeedback.innerHTML = "";
    elements.submitAnswer.disabled = false;
    elements.nextQuestion.disabled = true;

    const progress = getQuestionProgress(question.id);
    const badgeParts = [];
    if (progress.attempts > 0) {
      badgeParts.push(`已作答 ${progress.attempts} 次`);
    }
    if (progress.wrongCount > 0) {
      badgeParts.push(`錯 ${progress.wrongCount} 次`);
    }

    elements.questionPosition.textContent = `第 ${state.sessionIndex + 1} / ${state.queue.length} 題`;
    elements.questionChapter.textContent = question.chapterName;
    elements.questionBadge.textContent = badgeParts.join("，") || "新題目";
    elements.questionText.textContent = question.question;

    elements.optionsForm.innerHTML = "";
    question.options.forEach((option) => {
      const card = document.createElement("div");
      card.className = "option-card";

      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "answer";
      input.value = option.key;
      input.addEventListener("change", () => highlightSelectedOption());

      const copy = document.createElement("div");
      copy.innerHTML = `<strong>${option.key}</strong><span>${option.text}</span>`;

      label.append(input, copy);
      card.append(label);
      elements.optionsForm.append(card);
    });

    updateSummary();
  }

  function submitCurrentAnswer() {
    if (state.hasSubmitted || !state.currentQuestion) {
      return;
    }

    const selected = elements.optionsForm.querySelector("input[name='answer']:checked");
    if (!selected) {
      elements.answerFeedback.className = "answer-feedback incorrect";
      elements.answerFeedback.textContent = "請先選擇一個答案。";
      return;
    }

    const selectedKey = selected.value;
    const correctKey = state.currentQuestion.answer;
    const correctOption = state.currentQuestion.options.find((option) => option.key === correctKey);
    const isCorrect = selectedKey === correctKey;

    state.hasSubmitted = true;
    state.answered += 1;
    if (isCorrect) {
      state.correct += 1;
    }

    persistQuestionResult(state.currentQuestion.id, isCorrect);
    decorateSubmittedOptions(selectedKey, correctKey);

    elements.answerFeedback.className = `answer-feedback ${isCorrect ? "correct" : "incorrect"}`;
    elements.answerFeedback.innerHTML = isCorrect
      ? `答對了。正確答案是 ${correctKey}：${correctOption.text}`
      : `答錯了。你的答案是 ${selectedKey}，正確答案是 ${correctKey}：${correctOption.text}`;

    elements.submitAnswer.disabled = true;
    elements.nextQuestion.disabled = false;
    renderChapterFilters();
    renderChapterStats();
    updateSummary();
  }

  function decorateSubmittedOptions(selectedKey, correctKey) {
    const optionCards = [...elements.optionsForm.querySelectorAll(".option-card")];
    optionCards.forEach((card) => {
      const input = card.querySelector("input");
      input.disabled = true;
      card.classList.remove("selected");

      if (input.value === correctKey) {
        card.classList.add("correct");
      }

      if (input.value === selectedKey && selectedKey !== correctKey) {
        card.classList.add("incorrect");
      }
    });
  }

  function goToNextQuestion() {
    if (!state.hasSubmitted) {
      return;
    }

    state.sessionIndex += 1;
    renderCurrentQuestion();
  }

  function switchToWrongMode() {
    elements.practiceMode.value = "wrong";
    startSession();
  }

  function finishSession() {
    elements.quizCard.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    elements.emptyState.innerHTML = `
      <h3>本輪完成</h3>
      <p>共作答 ${state.answered} 題，答對 ${state.correct} 題，答對率 ${formatAccuracy(state.correct, state.answered)}。你可以切到錯題模式，持續練習上一輪答錯的題目。</p>
    `;
    updateSummary();
  }

  function updateSummary() {
    const wrongTotal = Object.values(state.progress.questions).filter((item) => item.lastResult === "wrong").length;
    elements.progressValue.textContent = `${Math.min(state.sessionIndex + (state.hasSubmitted ? 1 : 0), state.queue.length)} / ${state.queue.length}`;
    elements.accuracyValue.textContent = formatAccuracy(state.correct, state.answered);
    elements.wrongTotalValue.textContent = String(wrongTotal);
  }

  function clearProgress() {
    state.progress = { questions: {} };
    saveProgress();
    renderChapterFilters();
    renderChapterStats();
    updateSummary();
    elements.emptyState.classList.remove("hidden");
    elements.quizCard.classList.add("hidden");
    elements.sessionTitle.textContent = "作答紀錄已清除";
    elements.sessionSummary.textContent = "所有答題歷史與錯題標記都已重設。";
  }

  function getSelectedChapterIds() {
    return [...elements.chapterList.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
  }

  function highlightSelectedOption() {
    [...elements.optionsForm.querySelectorAll(".option-card")].forEach((card) => {
      const input = card.querySelector("input");
      card.classList.toggle("selected", input.checked);
    });
  }

  function buildSessionTitle(selectedChapterIds, mode) {
    const selectedChapters = questionBank.chapters.filter((chapter) => selectedChapterIds.includes(chapter.id));
    const chapterLabel = selectedChapters.length === questionBank.chapters.length
      ? "全部章節"
      : selectedChapters.map((chapter) => chapter.shortName).join("、");

    const modeLabelMap = {
      all: "全部題目",
      wrong: "錯題複習",
      unanswered: "未作答",
      "incorrectly-answered": "曾答錯題目",
    };

    return `${chapterLabel}｜${modeLabelMap[mode]}`;
  }

  function getQuestionProgress(questionId) {
    return state.progress.questions[questionId] || { attempts: 0, correctCount: 0, wrongCount: 0, lastResult: null };
  }

  function isWrongQuestion(questionId) {
    return getQuestionProgress(questionId).lastResult === "wrong";
  }

  function persistQuestionResult(questionId, isCorrect) {
    const progress = getQuestionProgress(questionId);
    state.progress.questions[questionId] = {
      attempts: progress.attempts + 1,
      correctCount: progress.correctCount + (isCorrect ? 1 : 0),
      wrongCount: progress.wrongCount + (isCorrect ? 0 : 1),
      lastResult: isCorrect ? "correct" : "wrong",
    };
    saveProgress();
  }

  function loadProgress() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { questions: {} };
    } catch (error) {
      return { questions: {} };
    }
  }

  function saveProgress() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function formatAccuracy(correct, total) {
    if (!total) {
      return "0%";
    }
    return `${Math.round((correct / total) * 100)}%`;
  }
}());
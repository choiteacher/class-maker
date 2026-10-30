import { verifyPassword, isLoggedIn, saveLogin, clearLogin } from "./auth.js";
import { validate, buildRequest, makeFileName, PAGE_TYPES, MOOD_CATEGORIES } from "./generator.js";

const STORAGE_KEY = "class-maker:draft:v1";
const MAX_PAGES = 40;
const $ = (id) => document.getElementById(id);
const shell = document.querySelector(".shell");
let loginFailures = 0;
let checkingPassword = false;
let loginLockedUntil = 0;
let loginTimer;

function loginStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function unlock() {
  $("lock").hidden = true;
  shell.hidden = false;
  $("password").value = "";
  $("password").removeAttribute("aria-invalid");
  loginFailures = 0;
  showStep(0);
}

function showLock(message = "") {
  shell.hidden = true;
  $("lock").hidden = false;
  $("password").value = "";
  $("password").removeAttribute("aria-invalid");
  $("lock-status").textContent = message;
  $("auth-status").hidden = true;
  $("password").focus();
}

function updateLoginLockout() {
  const remaining = Math.max(0, Math.ceil((loginLockedUntil - Date.now()) / 1000));
  $("password").disabled = remaining > 0;
  $("login-submit").disabled = remaining > 0;
  if (remaining > 0) {
    $("lock-status").textContent = `${remaining}초 뒤에 다시 입력할 수 있어요.`;
  } else {
    clearInterval(loginTimer);
    loginLockedUntil = 0;
    loginFailures = 0;
    $("lock-status").textContent = "비밀번호를 다시 입력해 주세요.";
    $("password").focus();
  }
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (checkingPassword || loginLockedUntil > 0) return;
  checkingPassword = true;
  $("login-submit").disabled = true;
  $("login-submit").textContent = "확인하고 있어요…";
  $("lock-status").textContent = "확인하고 있어요…";
  $("password").disabled = true;
  $("password").removeAttribute("aria-invalid");
  const valid = await verifyPassword($("password").value);
  $("password").value = "";
  $("password").disabled = false;
  $("login-submit").disabled = false;
  $("login-submit").textContent = "들어가기";
  checkingPassword = false;
  if (valid) {
    const saved = saveLogin(loginStorage());
    $("auth-status").textContent = saved ? "" : "이 브라우저에서는 로그인 상태를 기억하지 못해요.";
    $("auth-status").hidden = saved;
    $("lock-status").textContent = "";
    unlock();
  } else {
    loginFailures += 1;
    $("password").setAttribute("aria-invalid", "true");
    if (loginFailures >= 5) {
      loginLockedUntil = Date.now() + 30000;
      updateLoginLockout();
      loginTimer = setInterval(updateLoginLockout, 1000);
    } else {
      $("lock-status").textContent = "비밀번호가 맞지 않아요. 다시 입력해 주세요.";
      $("password").focus();
    }
  }
});

$("password").addEventListener("input", () => $("password").removeAttribute("aria-invalid"));
$("logout").addEventListener("click", () => {
  clearLogin(loginStorage());
  showLock("로그아웃했어요.");
});

const normalize = (value) => typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const blankPage = () => ({ title: "", content: "", type: "", activity: "", visual: "", layout: "" });
const defaults = () => ({
  basics: { audience: "", subject: "", goal: "", content: "" },
  design: { moodCategory: "", moods: [], moodNote: "", font: "", mainColor: "", extra: "" },
  pageCount: "",
  pages: [blankPage()],
});

// Only copy known fields into fresh objects. Stored text is always rendered as text.
function restoreDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const saved = JSON.parse(raw);
    if (!isObject(saved) || !isObject(saved.basics) || !isObject(saved.design)
      || !Array.isArray(saved.design.moods) || !Array.isArray(saved.pages)
      || saved.pages.some((page) => !isObject(page))) return null;
    const restored = defaults();
    const pageCount = normalize(saved.pageCount);
    restored.pageCount = /^\d+$/.test(pageCount) && Number(pageCount) >= 1 && Number(pageCount) <= MAX_PAGES ? pageCount : "";
    for (const key of Object.keys(restored.basics)) {
      restored.basics[key] = normalize(saved.basics[key]).slice(0, ["audience", "subject"].includes(key) ? 200 : 3000);
    }
    for (const key of ["moodNote", "font", "mainColor", "extra"]) {
      const limit = key === "mainColor" ? 7 : key === "font" ? 200 : 3000;
      restored.design[key] = normalize(saved.design[key]).slice(0, limit);
    }
    const moods = saved.design.moods.map(normalize);
    let category = MOOD_CATEGORIES.find((item) => item.id === saved.design.moodCategory);
    // Legacy v1 drafts have no category; infer only when every mood belongs to one group.
    if (!Object.hasOwn(saved.design, "moodCategory") && moods.length > 0) {
      category = MOOD_CATEGORIES.find((item) => moods.every((mood) => item.moods.includes(mood)));
    }
    restored.design.moodCategory = category?.id || "";
    restored.design.moods = category ? [...new Set(moods.filter((mood) => category.moods.includes(mood)))] : [];
    restored.pages = saved.pages.slice(0, MAX_PAGES).map((page) => {
      const clean = blankPage();
      for (const key of Object.keys(clean)) clean[key] = normalize(page[key]).slice(0, key === "title" ? 200 : 3000);
      if (!PAGE_TYPES.includes(clean.type)) clean.type = "";
      return clean;
    });
    return restored;
  } catch {
    return null;
  }
}

const restored = restoreDraft();
let data = restored || defaults();
let currentStep = 0;
let format = "md";
let colorUnset = data.design.mainColor === "";
let copyAttempt = 0;
// UI state follows page objects without changing the saved draft format.
const pageDetailsOpen = new WeakMap();
const renderedPageDetails = new Map();
const desktopLayout = window.matchMedia("(min-width: 900px)");

function syncDesignDetails() {
  $("design-details").open = desktopLayout.matches;
}
desktopLayout.addEventListener("change", syncDesignDetails);

function saveDraft() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    $("draft-status").textContent = "이 브라우저에 자동으로 저장했어요.";
  } catch {
    $("draft-status").textContent = "자동으로 저장하지 못했어요. 창을 닫기 전에 요청서를 내려받아 주세요.";
  }
}

function changed() {
  copyAttempt += 1;
  $("copy-status").textContent = "";
  $("download-status").textContent = "";
  saveDraft();
  if (currentStep === 3) renderPreview();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderErrors(errors) {
  const list = $("error-list");
  list.replaceChildren();
  for (const error of errors) {
    const item = element("li");
    item.append(element("span", "", error + " "));
    const targetStep = /희망 페이지 수|쪽|페이지/.test(error) ? 2 : 0;
    const link = element("a", "", targetStep === 2 ? "페이지 구성으로 이동" : "수업 정보로 이동");
    link.setAttribute("href", `#step-${targetStep}`);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showStep(targetStep);
    });
    item.append(link);
    list.append(item);
  }
  $("validation-errors").hidden = errors.length === 0;
}

function renderPreview() {
  renderErrors(validate(data));
  $("preview").textContent = buildRequest(data, format);
}

function showStep(step, focus = true) {
  currentStep = Math.max(0, Math.min(3, step));
  document.querySelectorAll(".step-panel").forEach((panel, index) => {
    panel.hidden = index !== currentStep;
  });
  document.querySelectorAll(".progress [data-step]").forEach((button) => {
    if (Number(button.dataset.step) === currentStep) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  $("previous").disabled = currentStep === 0;
  $("next").hidden = currentStep === 3;
  $("next").textContent = currentStep === 2 ? "미리보기 →" : "다음 →";
  $("step-position").textContent = `${currentStep + 1} / 4`;
  if (currentStep === 3) renderPreview();
  if (focus) $(`heading-${currentStep}`).focus();
}

function renderMoods() {
  const chips = $("mood-chips");
  chips.replaceChildren();
  const category = MOOD_CATEGORIES.find((item) => item.id === data.design.moodCategory);
  $("mood-category-help").hidden = Boolean(category);
  $("mood-details").hidden = !category;
  for (const mood of category?.moods || []) {
    const button = element("button", "chip", mood);
    button.type = "button";
    button.setAttribute("aria-pressed", String(data.design.moods.includes(mood)));
    button.addEventListener("click", () => {
      const selected = data.design.moods.includes(mood);
      data.design.moods = selected ? data.design.moods.filter((value) => value !== mood) : [...data.design.moods, mood];
      button.setAttribute("aria-pressed", String(!selected));
      changed();
    });
    chips.append(button);
  }
}

function syncColor() {
  $("color-unset").checked = colorUnset;
  $("color-picker").disabled = colorUnset;
  $("color-text").disabled = colorUnset;
  const valid = /^#[0-9a-f]{6}$/i.test(data.design.mainColor);
  if (valid) $("color-picker").value = data.design.mainColor;
  $("color-warning").hidden = colorUnset || valid;
  if (!colorUnset && !valid) $("color-text").setAttribute("aria-invalid", "true");
  else $("color-text").removeAttribute("aria-invalid");
}

function pageField(index, key, labelText, { rows = 3, select = false } = {}) {
  const field = element("div", select ? "field page-type" : "field");
  const id = `page-${index}-${key}`;
  const label = element("label", select ? "sr-only" : "", labelText);
  label.setAttribute("for", id);
  if (!select) label.append(element("span", "optional", "선택"));
  let input;
  if (select) {
    input = element("select");
    // The empty choice exists even if PAGE_TYPES only contains named types.
    for (const type of ["", ...PAGE_TYPES.filter((value) => value !== "")]) {
      const option = element("option", "", type || "페이지 유형: 지정 안 함");
      option.value = type;
      input.append(option);
    }
  } else if (key === "title") {
    input = element("input");
    input.type = "text";
    input.maxLength = 200;
  } else {
    input = element("textarea");
    input.rows = rows;
    input.maxLength = 3000;
  }
  input.id = id;
  input.value = data.pages[index][key];
  input.dataset.pageIndex = String(index);
  input.dataset.pageKey = key;
  field.append(label, input);
  return field;
}

function pageAction(index, action, text, description, disabled) {
  const button = element("button", "button quiet", text);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.pageIndex = String(index);
  button.setAttribute("aria-label", `${index + 1}쪽 ${description}`);
  button.disabled = disabled;
  return button;
}

function renderPages() {
  const container = $("pages");
  const addButton = $("add-page");
  // Read live properties too: native toggle events may still be queued.
  for (const [page, details] of renderedPageDetails) pageDetailsOpen.set(page, details.open);
  renderedPageDetails.clear();
  container.replaceChildren();
  const count = data.pages.length;
  $("page-count").textContent = `전체 ${count}쪽`;
  $("empty-pages").hidden = count !== 0;
  addButton.disabled = count >= MAX_PAGES;
  $("page-limit").hidden = count < MAX_PAGES;
  data.pages.forEach((page, index) => {
    const card = element("article", "page-card");
    card.setAttribute("aria-labelledby", `page-heading-${index}`);
    const heading = element("div", "page-heading");
    const title = element("h3", "page-number", `${index + 1}쪽`);
    title.id = `page-heading-${index}`;
    const actions = element("div", "page-actions");
    actions.append(
      pageAction(index, "up", "↑", "위로 이동", index === 0),
      pageAction(index, "down", "↓", "아래로 이동", index === count - 1),
      pageAction(index, "duplicate", "⧉", "복제", count >= MAX_PAGES),
      pageAction(index, "delete", "✕", "삭제", false),
    );
    heading.append(title, pageField(index, "type", "페이지 유형", { select: true }), actions);
    const details = element("details", "optional-details");
    details.open = pageDetailsOpen.get(page) || false;
    renderedPageDetails.set(page, details);
    details.addEventListener("toggle", () => {
      if (renderedPageDetails.get(page) !== details) return;
      pageDetailsOpen.set(page, details.open);
      updateDetailsToggle();
    });
    const summary = element("summary", "", "더 자세히");
    const body = element("div", "details-body");
    body.append(
      pageField(index, "activity", "발문·활동"),
      pageField(index, "visual", "이미지·도식"),
      pageField(index, "layout", "레이아웃 메모"),
    );
    details.append(summary, body);
    card.append(heading, pageField(index, "title", "제목"), pageField(index, "content", "핵심 내용"), details);
    container.append(card);
  });
  container.append(addButton);
  updateDetailsToggle();
}

function updateDetailsToggle() {
  const details = [...renderedPageDetails.values()];
  const allOpen = details.length > 0 && details.every((item) => item.open);
  const button = $("toggle-page-details");
  button.disabled = details.length === 0;
  button.textContent = allOpen ? "모두 접기" : "모두 펼치기";
  button.setAttribute("aria-expanded", String(allOpen));
}

function populateForm() {
  $("desired-page-count").value = data.pageCount;
  document.querySelectorAll("[data-group][data-key]").forEach((input) => {
    input.value = data[input.dataset.group][input.dataset.key];
  });
  $("color-text").value = data.design.mainColor;
  $("color-picker").value = "#7fb3e6";
  document.querySelectorAll('input[name="mood-category"]').forEach((radio) => {
    radio.checked = radio.value === data.design.moodCategory;
  });
  syncColor();
  renderMoods();
  renderPages();
}

document.querySelectorAll(".progress [data-step]").forEach((button) => {
  button.addEventListener("click", () => showStep(Number(button.dataset.step)));
});
$("previous").addEventListener("click", () => showStep(currentStep - 1));
$("next").addEventListener("click", () => showStep(currentStep + 1));

$("desired-page-count").addEventListener("input", () => {
  const input = $("desired-page-count");
  // Number inputs expose an empty value for incomplete numeric text.
  data.pageCount = input.validity.badInput ? "invalid" : normalize(input.value);
  changed();
});

document.querySelectorAll('input[name="mood-category"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    const category = MOOD_CATEGORIES.find((item) => item.id === radio.value);
    data.design.moodCategory = category?.id || "";
    data.design.moods = data.design.moods.filter((mood) => category?.moods.includes(mood));
    renderMoods();
    changed();
  });
});

document.querySelectorAll("[data-group][data-key]").forEach((input) => {
  input.addEventListener("input", () => {
    data[input.dataset.group][input.dataset.key] = normalize(input.value);
    changed();
  });
});

$("color-unset").addEventListener("change", () => {
  colorUnset = $("color-unset").checked;
  data.design.mainColor = colorUnset ? "" : normalize($("color-text").value) || $("color-picker").value;
  if (!colorUnset) $("color-text").value = data.design.mainColor;
  syncColor();
  changed();
});
$("color-picker").addEventListener("input", () => {
  data.design.mainColor = normalize($("color-picker").value);
  $("color-text").value = data.design.mainColor;
  syncColor();
  changed();
});
$("color-text").addEventListener("input", () => {
  data.design.mainColor = normalize($("color-text").value);
  syncColor();
  changed();
});

function updatePage(event) {
  const input = event.target;
  if (!input.dataset.pageKey) return;
  const page = data.pages[Number(input.dataset.pageIndex)];
  if (!page || !(input.dataset.pageKey in blankPage())) return;
  page[input.dataset.pageKey] = normalize(input.value);
  changed();
}
$("pages").addEventListener("input", updatePage);
$("pages").addEventListener("change", (event) => {
  if (event.target.tagName === "SELECT") updatePage(event);
});

$("toggle-page-details").addEventListener("click", () => {
  const details = [...renderedPageDetails.values()];
  const open = !details.every((item) => item.open);
  for (const [page, item] of renderedPageDetails) {
    item.open = open;
    pageDetailsOpen.set(page, open);
  }
  updateDetailsToggle();
});

$("add-page").addEventListener("click", () => {
  if (data.pages.length >= MAX_PAGES) return;
  data.pages.push(blankPage());
  renderPages();
  changed();
  $(`page-${data.pages.length - 1}-title`).focus();
  $("page-status").textContent = `${data.pages.length}쪽을 추가했어요.`;
});

$("pages").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const index = Number(button.dataset.pageIndex);
  const action = button.dataset.action;
  if (!Number.isInteger(index) || index < 0 || index >= data.pages.length) return;
  let focusIndex = index;
  let message;
  if (action === "up" && index > 0) {
    [data.pages[index - 1], data.pages[index]] = [data.pages[index], data.pages[index - 1]];
    focusIndex -= 1;
    message = `${index + 1}쪽을 ${index}쪽으로 옮겼어요.`;
  } else if (action === "down" && index < data.pages.length - 1) {
    [data.pages[index], data.pages[index + 1]] = [data.pages[index + 1], data.pages[index]];
    focusIndex += 1;
    message = `${index + 1}쪽을 ${index + 2}쪽으로 옮겼어요.`;
  } else if (action === "duplicate" && data.pages.length < MAX_PAGES) {
    const original = data.pages[index];
    const duplicate = { ...original };
    pageDetailsOpen.set(duplicate, renderedPageDetails.get(original).open);
    data.pages.splice(index + 1, 0, duplicate);
    focusIndex += 1;
    message = `${index + 1}쪽을 복제했어요.`;
  } else if (action === "delete") {
    data.pages.splice(index, 1);
    focusIndex = Math.min(index, data.pages.length - 1);
    message = `${index + 1}쪽을 삭제했어요.`;
  } else return;
  renderPages();
  changed();
  if (data.pages.length) $(`page-${focusIndex}-title`).focus();
  else $("add-page").focus();
  $("page-status").textContent = message;
});

document.querySelectorAll('input[name="format"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    format = radio.value;
    copyAttempt += 1;
    $("copy-status").textContent = "";
    $("download-status").textContent = "";
    renderPreview();
  });
});

$("copy").addEventListener("click", async () => {
  const attempt = ++copyAttempt;
  let message;
  try {
    await navigator.clipboard.writeText($("preview").textContent);
    message = "복사했어요.";
  } catch {
    message = "복사하지 못했어요. 미리보기에서 직접 선택해 복사해 주세요.";
  }
  if (attempt === copyAttempt) $("copy-status").textContent = message;
});

$("generate").addEventListener("click", () => {
  const errors = validate(data);
  renderErrors(errors);
  $("download-status").textContent = "";
  if (errors.length) {
    $("error-list").querySelector("a")?.focus();
    return;
  }
  const text = buildRequest(data, format);
  $("preview").textContent = text;
  const blob = new Blob([text], { type: format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" });
  let url;
  let link;
  try {
    url = URL.createObjectURL(blob);
    link = element("a");
    link.href = url;
    link.download = makeFileName(data, format);
    link.hidden = true;
    document.body.append(link);
    link.click();
    $("download-status").textContent = "이 파일을 Claude 또는 Claude Code 대화창에 올리면 미리캔버스로 수업 자료를 만들어 드려요.";
  } catch {
    $("download-status").textContent = "내려받지 못했어요. 다시 시도하거나 ‘복사’로 요청서를 옮겨 주세요.";
  } finally {
    link?.remove();
    // Give the browser a turn to start consuming the download before revoking it.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

$("reset").addEventListener("click", () => {
  if (!window.confirm("지금까지 쓴 내용을 지우고 새로 시작할까요?")) return;
  data = defaults();
  colorUnset = true;
  format = "md";
  copyAttempt += 1;
  document.querySelectorAll("details").forEach((details) => { details.open = false; });
  syncDesignDetails();
  $("format-md").checked = true;
  $("format-txt").checked = false;
  $("copy-status").textContent = "";
  $("download-status").textContent = "";
  $("page-status").textContent = "";
  $("preview").textContent = "요청서를 준비하고 있어요.";
  renderErrors([]);
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    $("draft-status").textContent = "새로 시작했어요. 입력한 내용은 이 브라우저에 자동으로 저장돼요.";
  } catch {
    $("draft-status").textContent = "화면을 새로 시작했어요. 이전 초안을 지우지 못했으니 공유 기기에서는 브라우저의 저장된 내용을 지워 주세요.";
  }
  populateForm();
  showStep(0);
});

syncDesignDetails();
populateForm();
showStep(0, false);
if (restored) $("draft-status").textContent = "이전에 쓰던 내용을 불러왔어요.";
if (isLoggedIn(loginStorage())) unlock();
else showLock();

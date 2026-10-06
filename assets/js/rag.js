const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_DOCUMENT_CHARS = 1_000_000;
const MAX_CHUNKS = 1_000;
const CHUNK_WORDS = 210;
const CHUNK_OVERLAP = 35;
const MAX_CONTEXTS = 5;
const STOP_WORDS = new Set("a an and are as at be been but by can do for from had has have he her hers him his how i if in into is it its me my of on or our she so that the their them then there these they this to was we were what when where which who will with you your".split(" "));
const QUERY_SYNONYMS = {
  ability: ["skill", "expertise", "proficiency"],
  capability: ["skill", "ability", "competence"],
  competence: ["skill", "ability", "proficiency"],
  competency: ["skill", "ability", "proficiency"],
  developer: ["programmer", "engineer", "coder"],
  expertise: ["skill", "ability", "proficiency"],
  family: ["last", "surname"],
  first: ["given", "forename"],
  given: ["first", "forename"],
  learner: ["student", "pupil"],
  last: ["surname", "family"],
  proficiency: ["skill", "ability", "expertise"],
  programmer: ["developer", "engineer", "coder"],
  skill: ["ability", "expertise", "proficiency"],
  student: ["learner", "pupil"],
  surname: ["last", "family"]
};
const NAME_SEARCH_TERMS = ["first", "forename", "given", "last", "family", "surname"];
const SKILL_INDICATORS = new Set("algorithm algorithms backend c c++ css database databases design designing git html java javascript node python react sql".split(" "));
const NON_NAME_PREFIXES = new Set("about computer core creative digital education hard key personal professional soft technical web work".split(" "));
const PERSON_NAME_PATTERN = /\b([\p{Lu}][\p{L}'’-]+)\s+([\p{Lu}][\p{L}'’-]+)\b/gu;
const NAME_CUE_PATTERN = /\b(?:(?:(?:full|student|my)\s+name|name(?:\s+of\s+(?:the\s+)?(?:student|person))?)\s*(?:is|:)|(?:i['’]m|i am|called))\s*([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+)+)/gu;

const fileInput = document.querySelector("#fileInput");
const addFilesButton = document.querySelector("#addFilesButton");
const dropZone = document.querySelector("#dropZone");
const fileList = document.querySelector("#fileList");
const documentCount = document.querySelector("#documentCount");
const libraryStatus = document.querySelector("#libraryStatus");
const clearLibraryButton = document.querySelector("#clearLibraryButton");
const questionForm = document.querySelector("#questionForm");
const questionInput = document.querySelector("#questionInput");
const askButton = document.querySelector("#askButton");
const messages = document.querySelector("#messages");

const documents = new Map();
let chunks = [];
let working = false;

function setStatus(message, isError = false) {
  libraryStatus.textContent = message;
  libraryStatus.classList.toggle("error", isError);
}

function words(text) {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).map((term) => {
    if (STOP_WORDS.has(term)) return term;
    if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
    if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) return term.slice(0, -1);
    return term;
  });
}

function hasPersonName(text) {
  for (const match of text.matchAll(NAME_CUE_PATTERN)) {
    if (words(match[1]).length >= 2) return true;
  }
  for (const match of text.matchAll(PERSON_NAME_PATTERN)) {
    const [first, last] = words(`${match[1]} ${match[2]}`);
    if (!STOP_WORDS.has(first) && !STOP_WORDS.has(last) && !NON_NAME_PREFIXES.has(first)) return true;
  }
  return false;
}

function cleanText(text) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function createChunks(text, source) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const step = CHUNK_WORDS - CHUNK_OVERLAP;
  const result = [];

  for (let start = 0; start < tokens.length; start += step) {
    const content = tokens.slice(start, start + CHUNK_WORDS).join(" ").slice(0, 3000).trim();
    if (content) {
      const terms = words(content);
      if (hasPersonName(content)) terms.push(...NAME_SEARCH_TERMS);
      result.push({ source, part: result.length + 1, text: content, terms });
    }
    if (start + CHUNK_WORDS >= tokens.length) break;
  }
  return result;
}

function characterNgrams(term) {
  const padded = `  ${term} `;
  const ngrams = new Set();
  for (let index = 0; index < padded.length - 2; index += 1) {
    ngrams.add(padded.slice(index, index + 3));
  }
  return ngrams;
}

function termSimilarity(left, right) {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) >= 4 && (left.startsWith(right) || right.startsWith(left))) return 0.8;

  const leftNgrams = characterNgrams(left);
  const rightNgrams = characterNgrams(right);
  let overlap = 0;
  for (const ngram of leftNgrams) {
    if (rightNgrams.has(ngram)) overlap += 1;
  }
  return (2 * overlap) / (leftNgrams.size + rightNgrams.size);
}

function fallbackRankChunks(question, queryTerms) {
  const intentTerms = [];
  if (/\b(name|who|student|learner|person|identity|last|surname|first|forename)\b/i.test(question)) {
    intentTerms.push({ terms: NAME_SEARCH_TERMS, weight: 2 });
  }
  if (/\b(skill|ability|expertise|proficiency|capabilit\w*|competenc\w*|talent|good at|know|able to|can\s+\w+\s+do)\b/i.test(question)) {
    intentTerms.push({ terms: ["skill", "ability", "expertise", "proficiency", "technical", "creative"], weight: 2 });
  }

  return chunks
    .map((chunk) => {
      const chunkTerms = new Set(chunk.terms);
      let score = 0;
      for (const [queryTerm, queryWeight] of queryTerms) {
        let bestSimilarity = 0;
        for (const chunkTerm of chunkTerms) {
          bestSimilarity = Math.max(bestSimilarity, termSimilarity(queryTerm, chunkTerm));
        }
        if (bestSimilarity >= 0.35) score += queryWeight * bestSimilarity;
      }
      for (const intent of intentTerms) {
        if (intent.terms.some((term) => chunkTerms.has(term))) score += intent.weight;
      }
      if (intentTerms.some((intent) => intent.terms.includes("skill"))) {
        let skillEvidence = 0;
        for (const term of chunkTerms) {
          if (SKILL_INDICATORS.has(term)) skillEvidence += 1;
        }
        score += Math.min(skillEvidence, 6) * 0.5;
      }
      if (intentTerms.some((intent) => intent.terms.includes("last") || intent.terms.includes("surname")) &&
          hasPersonName(chunk.text)) {
        score += 2;
      }
      return { chunk, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(MAX_CONTEXTS, chunks.length))
    .map(({ chunk }) => chunk);
}

async function readDocument(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (["txt", "md", "csv", "json"].includes(extension)) return file.text();

  if (extension === "docx") {
    if (!window.mammoth) throw new Error("The DOCX reader did not load. Check your connection and try again.");
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  if (extension === "pdf") {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    if (pdf.numPages > 500) throw new Error("PDFs are limited to 500 pages.");

    const pages = [];
    let extractedCharacters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => "str" in item ? item.str : "").join(" ");
      extractedCharacters += pageText.length + 2;
      if (extractedCharacters > MAX_DOCUMENT_CHARS) {
        throw new Error("This file contains more than 1,000,000 extracted characters. Split it into smaller files.");
      }
      pages.push(pageText);
    }
    return pages.join("\n\n");
  }

  throw new Error("Unsupported file type. Add a PDF, DOCX, TXT, Markdown, CSV, or JSON file.");
}

function updateLibrary() {
  fileList.replaceChildren();
  const fileCount = documents.size;
  documentCount.textContent = `${fileCount} ${fileCount === 1 ? "file" : "files"}`;
  clearLibraryButton.hidden = fileCount === 0;

  for (const [key, entry] of documents) {
    const item = document.createElement("li");
    item.className = "file-item";
    const type = document.createElement("span");
    type.className = "file-type";
    type.textContent = entry.extension;
    const meta = document.createElement("div");
    meta.className = "file-meta";
    const name = document.createElement("p");
    name.className = "file-name";
    name.textContent = entry.name;
    name.title = entry.name;
    const detail = document.createElement("p");
    detail.className = "file-detail";
    detail.textContent = `${entry.chunkCount} searchable ${entry.chunkCount === 1 ? "passage" : "passages"}`;
    const remove = document.createElement("button");
    remove.className = "remove-file";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${entry.name}`);
    remove.addEventListener("click", () => {
      documents.delete(key);
      chunks = chunks.filter((chunk) => chunk.key !== key);
      updateLibrary();
      updateAskButton();
      setStatus(`${entry.name} removed.`);
    });
    meta.append(name, detail);
    item.append(type, meta, remove);
    fileList.append(item);
  }
}

function updateAskButton() {
  askButton.disabled = working || chunks.length === 0;
  addFilesButton.disabled = working;
  fileInput.disabled = working;
  questionInput.disabled = working;
  clearLibraryButton.disabled = working;
}

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function addFiles(fileArray) {
  if (working) {
    setStatus("Wait for the current documents to finish processing.", true);
    return;
  }
  const selected = Array.from(fileArray);
  if (selected.length === 0) {
    setStatus("Choose at least one document first.", true);
    return;
  }

  const newFiles = selected.filter((file) => !documents.has(fileKey(file)));
  if (newFiles.length === 0) {
    setStatus("Those files are already in your library.", true);
    return;
  }
  if (documents.size + newFiles.length > MAX_FILES) {
    setStatus(`Your library can contain up to ${MAX_FILES} files.`, true);
    return;
  }

  const currentBytes = Array.from(documents.values()).reduce((total, document) => total + document.size, 0);
  const selectedBytes = newFiles.reduce((total, file) => total + file.size, 0);
  if (newFiles.some((file) => file.size > MAX_FILE_BYTES)) {
    setStatus("Each file must be 8 MB or smaller.", true);
    return;
  }
  if (currentBytes + selectedBytes > MAX_TOTAL_BYTES) {
    setStatus("The total size of your library cannot exceed 24 MB.", true);
    return;
  }

  working = true;
  updateAskButton();
  const failures = [];
  let added = 0;

  for (const file of newFiles) {
    setStatus(`Reading ${file.name}…`);
    try {
      if (file.name.length > 150) throw new Error("File names must be 150 characters or fewer.");
      const rawText = await readDocument(file);
      const text = cleanText(rawText);
      if (!text) throw new Error("No readable text was found. Scanned PDFs need OCR before they can be used.");
      if (text.length > MAX_DOCUMENT_CHARS) {
        throw new Error("This file contains more than 1,000,000 extracted characters. Split it into smaller files.");
      }

      const fileChunks = createChunks(text, file.name);
      const newChunkCount = chunks.length + fileChunks.length;
      if (newChunkCount > MAX_CHUNKS) {
        throw new Error(`Your library exceeds the ${MAX_CHUNKS}-passage limit. Remove a file or use smaller documents.`);
      }

      const key = fileKey(file);
      documents.set(key, {
        name: file.name,
        extension: file.name.split(".").pop().toLowerCase(),
        size: file.size,
        chunkCount: fileChunks.length
      });
      chunks.push(...fileChunks.map((chunk) => ({ ...chunk, key })));
      added += 1;
    } catch (error) {
      failures.push(`${file.name}: ${error.message}`);
    }
  }

  working = false;
  updateLibrary();
  updateAskButton();
  fileInput.value = "";
  if (failures.length) {
    setStatus(`${added} file${added === 1 ? "" : "s"} added. ${failures.join(" ")}`, added === 0);
  } else {
    setStatus(`${added} file${added === 1 ? "" : "s"} processed and ready to search.`);
  }
}

function rankChunks(question) {
  const queryTerms = new Map();
  for (const term of words(question).filter((word) => !STOP_WORDS.has(word))) {
    queryTerms.set(term, 1);
    for (const synonym of QUERY_SYNONYMS[term] || []) {
      if (!queryTerms.has(synonym)) queryTerms.set(synonym, 0.55);
    }
  }
  if (chunks.length === 0) return [];
  if (queryTerms.size === 0) return fallbackRankChunks(question, queryTerms);

  const documentFrequency = new Map();
  for (const chunk of chunks) {
    for (const term of new Set(chunk.terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const averageLength = chunks.reduce((sum, chunk) => sum + chunk.terms.length, 0) / chunks.length || 1;
  const matches = chunks
    .map((chunk) => {
      let score = 0;
      const termCounts = new Map();
      for (const term of chunk.terms) termCounts.set(term, (termCounts.get(term) || 0) + 1);
      for (const [term, weight] of queryTerms) {
        const frequency = termCounts.get(term) || 0;
        const count = documentFrequency.get(term) || 0;
        if (!frequency || !count) continue;
        const inverseFrequency = Math.log(1 + (chunks.length - count + 0.5) / (count + 0.5));
        score += weight * inverseFrequency * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * chunk.terms.length / averageLength));
      }
      return { chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXTS)
    .map((result) => result.chunk);
  return matches.length > 0 ? matches : fallbackRankChunks(question, queryTerms);
}

function addMessage(text, role, sources = []) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;

  if (role === "assistant") {
    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "R";
    article.append(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  content.append(paragraph);

  if (sources.length) {
    const sourceList = document.createElement("ul");
    sourceList.className = "source-list";
    sourceList.setAttribute("aria-label", "Sources used");
    for (const source of sources) {
      const item = document.createElement("li");
      item.textContent = `${source.source} · passage ${source.part}`;
      sourceList.append(item);
    }
    content.append(sourceList);
  }

  article.append(content);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function addTypingIndicator() {
  const article = document.createElement("article");
  article.className = "message assistant-message";
  article.innerHTML = '<span class="message-avatar" aria-hidden="true">R</span><div class="message-content"><span class="typing" role="status"><span></span><span></span><span></span> Searching your sources and writing an answer…</span></div>';
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

async function askQuestion(question) {
  const matches = rankChunks(question);
  if (chunks.length === 0 || matches.length === 0) {
    addMessage("I couldn't find a relevant passage because there are no usable passages in the documents currently in your library. Add a document with readable text and try again.", "assistant");
    return;
  }

  const pending = addTypingIndicator();
  working = true;
  updateAskButton();

  try {
    const response = await fetch("/api/rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        contexts: matches.map(({ source, part, text }) => ({ source, part, text }))
      })
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("The RAG API returned an unreadable response. Check that the app is deployed with its serverless API.");
    }
    if (!response.ok) {
      if (typeof result.message === "string" && typeof result.model === "string") {
        const geminiStatus = Number.isInteger(result.status) ? `HTTP ${result.status}` : "HTTP status unavailable";
        throw new Error(`Gemini ${geminiStatus} (${result.model}): ${result.message}`);
      }
      throw new Error(result.error || `The RAG API request failed (${response.status}).`);
    }
    if (typeof result.answer !== "string" || !result.answer.trim()) throw new Error("The AI service returned an empty answer. Please try again.");
    pending.remove();
    addMessage(result.answer, "assistant", matches);
  } catch (error) {
    pending.remove();
    addMessage(error.message, "assistant");
  } finally {
    working = false;
    updateAskButton();
    questionInput.focus();
  }
}

addFilesButton.addEventListener("click", () => addFiles(fileInput.files));
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) addFiles(fileInput.files);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
});

clearLibraryButton.addEventListener("click", () => {
  documents.clear();
  chunks = [];
  updateLibrary();
  updateAskButton();
  setStatus("All documents removed from this browser session.");
});

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (working) return;
  const question = questionInput.value.trim();
  if (!question) return;
  if (chunks.length === 0) {
    addMessage("Add and process at least one document before asking a question.", "assistant");
    return;
  }
  addMessage(question, "user");
  questionInput.value = "";
  await askQuestion(question);
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    questionForm.requestSubmit();
  }
});

updateLibrary();
updateAskButton();

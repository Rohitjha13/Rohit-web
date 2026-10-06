(() => {
  const paragraph = document.querySelector(".intro-copy");
  if (!paragraph || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const text = paragraph.textContent;
  const words = text.split(/(\s+)/);
  const fragment = document.createDocumentFragment();
  let wordIndex = 0;

  for (const part of words) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      fragment.append(document.createTextNode(part));
      continue;
    }

    const word = document.createElement("span");
    word.className = "intro-word";
    word.style.setProperty("--word-index", String(wordIndex));
    word.setAttribute("aria-hidden", "true");
    word.textContent = part;
    fragment.append(word);
    wordIndex += 1;
  }

  paragraph.setAttribute("aria-label", text);
  paragraph.replaceChildren(fragment);
  paragraph.classList.add("has-word-animation");

  if (!("IntersectionObserver" in window)) {
    paragraph.classList.add("is-visible");
    return;
  }

  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    paragraph.classList.add("is-visible");
    observer.disconnect();
  }, { threshold: 0.15 });

  observer.observe(paragraph);
})();

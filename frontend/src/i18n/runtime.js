import { translateUiText } from "./translations";

const translatedAttributes = ["placeholder", "aria-label", "title", "alt"];
const ignoredTags = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);

const shouldSkipTextNode = (node) => {
  const parent = node.parentElement;
  if (!parent) return true;
  if (ignoredTags.has(parent.tagName)) return true;
  return !node.nodeValue?.trim();
};

const translateTextNode = (node, language) => {
  if (shouldSkipTextNode(node)) return;

  const currentValue = node.nodeValue;
  const nextValue =
    language === "ar" ? translateUiText(currentValue, language) : currentValue;
  if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
};

const translateElementAttributes = (element, language) => {
  if (!(element instanceof HTMLElement)) return;
  if (ignoredTags.has(element.tagName)) return;

  for (const attr of translatedAttributes) {
    if (!element.hasAttribute(attr)) continue;

    const currentValue = element.getAttribute(attr);
    const nextValue =
      language === "ar"
        ? translateUiText(currentValue, language)
        : currentValue;
    if (element.getAttribute(attr) !== nextValue) element.setAttribute(attr, nextValue);
  }
};

const walkNode = (node, language) => {
  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node, language);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  translateElementAttributes(node, language);

  for (const child of node.childNodes) {
    walkNode(child, language);
  }
};

export const applyRuntimeTranslations = (language) => {
  walkNode(document.body, language);
};

export const startRuntimeTranslationObserver = (getLanguage) => {
  const observer = new MutationObserver((mutations) => {
    const language = getLanguage();

    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target, language);
        continue;
      }

      if (mutation.type === "attributes") {
        translateElementAttributes(mutation.target, language);
        continue;
      }

      for (const node of mutation.addedNodes) {
        walkNode(node, language);
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: translatedAttributes,
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
};

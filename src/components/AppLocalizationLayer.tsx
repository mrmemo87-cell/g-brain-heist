import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import FloatingLanguageControl from './FloatingLanguageControl';
import type { Language } from '../i18n/language';
import { hasInterfaceTranslation, normalizeInterfaceSource, translateInterfaceText } from '../i18n/interfaceTranslations';
import { hasSupplementalInterfaceTranslation, translateSupplementalInterfaceText } from '../i18n/interfaceTranslationSupplement';
import { hasFragmentInterfaceTranslation, translateFragmentInterfaceText } from '../i18n/interfaceTranslationFragments';
import { hasAuditedInterfaceTranslation, translateAuditedInterfaceText } from '../i18n/interfaceTranslationAudit';

const ENGLISH_CONTENT_SELECTOR = [
  '[lang="en"]',
  '[data-language-lock="en"]',
  '[data-assessment-language="en"]',
  'iframe', 'script', 'style', 'code', 'pre', 'textarea', '[contenteditable="true"]',
  '[class*="cambridge-question" i]', '[class*="cambridge-test" i]', '[class*="cambridge-exam" i]',
  '[data-testid*="cambridge-question" i]', '[data-testid*="cambridge-passage" i]',
  '[class*="ielts-question" i]', '[class*="ielts-passage" i]', '[class*="ielts-exam" i]',
  '[data-testid*="ielts-question" i]', '[data-testid*="ielts-passage" i]', '[data-testid*="ielts-exam" i]',
].join(',');

const SKIP_TRANSLATION_SELECTOR = [
  ENGLISH_CONTENT_SELECTOR,
  '[data-no-interface-translation="true"]',
  '[data-global-language-control="true"]',
].join(',');

type TextState = { source: string; rendered: string };
type AttributeState = { source: string; rendered: string };
type TrackedTranslation = { translated: string; matched: boolean };

function splitOuterWhitespace(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const coreEnd = Math.max(leading.length, value.length - trailing.length);
  return { leading, trailing, core: value.slice(leading.length, coreEnd) };
}

function isWithin(root: HTMLElement, node: Element | null, selector: string): boolean {
  const match = node?.closest(selector);
  return Boolean(match && root.contains(match));
}

function ensureEnglishDirection(element: Element) {
  if (!element.matches(ENGLISH_CONTENT_SELECTOR)) return;
  if (!element.hasAttribute('lang')) element.setAttribute('lang', 'en');
  if (!element.hasAttribute('dir')) element.setAttribute('dir', 'ltr');
}

function hasApprovedTranslation(value: string): boolean {
  return hasInterfaceTranslation(value)
    || hasSupplementalInterfaceTranslation(value)
    || hasFragmentInterfaceTranslation(value)
    || hasAuditedInterfaceTranslation(value);
}

function translateApprovedText(language: Language, value: string): string {
  const fragment = translateFragmentInterfaceText(language, value);
  if (fragment !== null) return fragment;
  const audited = translateAuditedInterfaceText(language, value);
  if (audited !== null) return audited;
  const supplemental = translateSupplementalInterfaceText(language, value);
  if (supplemental !== null) return supplemental;
  return translateInterfaceText(language, value);
}

function translationCandidate(value: string): string | null {
  const normalized = normalizeInterfaceSource(value);
  if (!normalized) return null;
  if (hasApprovedTranslation(normalized)) return normalized;

  const capitalized = normalized.length > 1
    ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
    : normalized.toUpperCase();
  return capitalized !== normalized && hasApprovedTranslation(capitalized) ? capitalized : null;
}

function translateTrackedText(language: Language, value: string): TrackedTranslation {
  const normalized = normalizeInterfaceSource(value);
  if (!normalized) return { translated: value, matched: false };

  const wholeCandidate = translationCandidate(normalized);
  if (wholeCandidate) {
    return {
      translated: language === 'en' ? value : translateApprovedText(language, wholeCandidate),
      matched: true,
    };
  }

  let matched = false;
  const translated = value
    .split(/(\s+)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part)) return part;

      const tokenMatch = part.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'’/&+-]*)([^A-Za-z0-9]*)$/);
      if (!tokenMatch) return part;

      const [, prefix, core, suffix] = tokenMatch;
      const candidate = translationCandidate(core);
      if (!candidate) return part;

      matched = true;
      const translatedCore = language === 'en' ? core : translateApprovedText(language, candidate);
      return `${prefix}${translatedCore}${suffix}`;
    })
    .join('');

  return { translated, matched };
}

function isIeltsScope(root: HTMLElement | null): boolean {
  const params = new URLSearchParams(window.location.search);
  return /^\/ielts(?:\/|$)/i.test(window.location.pathname)
    || params.get('view') === 'ielts'
    || (params.get('view') === 'school_admin' && params.get('adminTab') === 'ielts')
    || Boolean(root?.querySelector('[data-ielts-route], .school-admin-ielts-tab'));
}

export function AppLocalizationLayer({
  children,
  language,
  direction,
  setLanguage,
}: {
  children: React.ReactNode;
  language: Language;
  direction: 'ltr' | 'rtl';
  setLanguage: (language: Language) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hideLanguageControl, setHideLanguageControl] = useState(() => isIeltsScope(null));
  useLayoutEffect(() => {
    const check = () => setHideLanguageControl(isIeltsScope(rootRef.current));
    check();
    const observer = new MutationObserver(check);
    if (rootRef.current) observer.observe(rootRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-ielts-route'] });
    window.addEventListener('popstate', check);
    return () => { observer.disconnect(); window.removeEventListener('popstate', check); };
  }, []);
  const textStates = useRef(new WeakMap<Text, TextState>());
  const attributeStates = useRef(new WeakMap<Element, Map<string, AttributeState>>());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const processText = (text: Text) => {
      const parent = text.parentElement;
      if (!parent || isWithin(root, parent, SKIP_TRANSLATION_SELECTOR)) return;

      const current = text.nodeValue ?? '';
      const previous = textStates.current.get(text);
      let sourceRaw = previous?.source ?? current;

      if (previous && current !== previous.rendered && current !== previous.source) {
        sourceRaw = current;
      }

      const { leading, trailing, core } = splitOuterWhitespace(sourceRaw);
      const tracked = translateTrackedText(language, core);
      if (!tracked.matched) {
        if (previous && current !== sourceRaw) text.nodeValue = sourceRaw;
        textStates.current.delete(text);
        return;
      }

      const next = `${leading}${tracked.translated}${trailing}`;
      textStates.current.set(text, { source: sourceRaw, rendered: next });
      if (current !== next) text.nodeValue = next;
    };

    const processElement = (element: Element) => {
      ensureEnglishDirection(element);
      if (isWithin(root, element, SKIP_TRANSLATION_SELECTOR)) return;

      for (const attr of ['aria-label', 'title', 'placeholder']) {
        const current = element.getAttribute(attr);
        if (!current) continue;

        let byAttribute = attributeStates.current.get(element);
        if (!byAttribute) {
          byAttribute = new Map<string, AttributeState>();
          attributeStates.current.set(element, byAttribute);
        }

        const previous = byAttribute.get(attr);
        let source = previous?.source ?? current;
        if (previous && current !== previous.rendered && current !== previous.source) source = current;

        const tracked = translateTrackedText(language, source);
        if (!tracked.matched) {
          if (previous && current !== source) element.setAttribute(attr, source);
          byAttribute.delete(attr);
          continue;
        }

        byAttribute.set(attr, { source, rendered: tracked.translated });
        if (current !== tracked.translated) element.setAttribute(attr, tracked.translated);
      }
    };

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        processText(node as Text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;
      processElement(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let child = walker.nextNode();
      while (child) {
        if (child.nodeType === Node.TEXT_NODE) processText(child as Text);
        else processElement(child as Element);
        child = walker.nextNode();
      }
    };

    processNode(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') processNode(mutation.target);
        if (mutation.type === 'attributes') processNode(mutation.target);
        mutation.addedNodes.forEach(processNode);
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'placeholder'],
    });

    return () => observer.disconnect();
  }, [language]);

  return (
    <div
      ref={rootRef}
      className="app-localization-layer"
      data-interface-language={language}
      lang={language}
      dir={direction}
      style={{ minHeight: '100%', width: '100%', direction }}
    >
      {children}
      {!hideLanguageControl && <FloatingLanguageControl language={language} setLanguage={setLanguage} />}
    </div>
  );
}

export default AppLocalizationLayer;

import React, { useEffect, useMemo, useRef } from 'react';
import type { Language } from '../i18n/language';
import { hasInterfaceTranslation, normalizeInterfaceSource, translateInterfaceText } from '../i18n/interfaceTranslations';

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

function LanguageControl({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  const labels: Record<Language, { short: string; name: string }> = useMemo(() => ({
    en: { short: 'EN', name: 'English' },
    ar: { short: 'ع', name: 'العربية' },
    ru: { short: 'RU', name: 'Русский' },
  }), []);

  return (
    <div
      data-global-language-control="true"
      role="group"
      aria-label="Interface language"
      dir="ltr"
      style={{
        position: 'fixed',
        right: 'max(14px, env(safe-area-inset-right))',
        bottom: 'max(14px, env(safe-area-inset-bottom))',
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 6,
        borderRadius: 18,
        border: '1px solid rgba(103,232,249,0.28)',
        background: 'linear-gradient(145deg, rgba(11,18,32,0.97), rgba(17,24,39,0.97))',
        boxShadow: '0 18px 55px rgba(2,6,23,0.52), 0 0 30px rgba(34,211,238,0.10), inset 0 1px 0 rgba(255,255,255,0.06)',
        WebkitBackdropFilter: 'blur(16px)',
        backdropFilter: 'blur(16px)',
        fontFamily: 'inherit',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 12,
          color: '#67e8f9',
          background: 'rgba(34,211,238,0.08)',
          border: '1px solid rgba(103,232,249,0.14)',
          fontSize: 17,
        }}
      >
        🌐
      </span>
      {(['en', 'ar', 'ru'] as Language[]).map((code) => {
        const active = language === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            aria-label={labels[code].name}
            title={labels[code].name}
            style={{
              minWidth: 38,
              height: 38,
              padding: '0 10px',
              border: active ? '1px solid rgba(103,232,249,0.82)' : '1px solid transparent',
              borderRadius: 12,
              cursor: 'pointer',
              color: active ? '#06111d' : '#dbeafe',
              background: active
                ? 'linear-gradient(135deg, #67e8f9 0%, #38bdf8 58%, #a78bfa 100%)'
                : 'transparent',
              boxShadow: active ? '0 7px 20px rgba(56,189,248,0.28)' : 'none',
              fontSize: code === 'ar' ? 17 : 12,
              fontWeight: 900,
              letterSpacing: code === 'ar' ? 0 : '0.04em',
              transition: 'transform 140ms ease, background 140ms ease, border-color 140ms ease',
            }}
          >
            {labels[code].short}
          </button>
        );
      })}
    </div>
  );
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
      const normalized = normalizeInterfaceSource(core);
      if (!normalized || !hasInterfaceTranslation(normalized)) {
        if (previous && current !== sourceRaw) text.nodeValue = sourceRaw;
        textStates.current.delete(text);
        return;
      }

      const translated = translateInterfaceText(language, normalized);
      const next = `${leading}${translated}${trailing}`;
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

        if (!hasInterfaceTranslation(source)) {
          if (previous && current !== source) element.setAttribute(attr, source);
          byAttribute.delete(attr);
          continue;
        }

        const translated = translateInterfaceText(language, source);
        byAttribute.set(attr, { source, rendered: translated });
        if (current !== translated) element.setAttribute(attr, translated);
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
      style={{ minHeight: '100%', width: '100%' }}
    >
      {children}
      <LanguageControl language={language} setLanguage={setLanguage} />
    </div>
  );
}

export default AppLocalizationLayer;

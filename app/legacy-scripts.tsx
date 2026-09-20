'use client';

import { useEffect } from 'react';

function scriptId(src: string) {
  return `reprolab-script-${src.replace(/[^a-z0-9]+/gi, '-')}`;
}

function appendScript(src: string, module = false) {
  const id = scriptId(src);
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing)
    return existing;

  const script = document.createElement('script');
  script.id = id;
  script.src = src;
  if (module)
    script.type = 'module';
  document.body.append(script);
  return script;
}

/** Loads the legacy browser application only after React has hydrated its shell. */
export function WorkbenchScript() {
  useEffect(() => {
    appendScript('/app.js', true);
  }, []);

  return null;
}

/** Preserves the SDK-before-sandbox execution order without racing hydration. */
export function SandboxScripts() {
  useEffect(() => {
    const loadSandbox = () => appendScript('/sandbox.js', true);
    const sdk = appendScript('/sdk/reprolab.js');

    if ('ReproLab' in window)
      loadSandbox();
    else
      sdk.addEventListener('load', loadSandbox, { once: true });
  }, []);

  return null;
}

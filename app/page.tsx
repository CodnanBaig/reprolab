import Script from 'next/script';

export default function WorkbenchPage() {
  return (
    <>
      <main id="app"><div className="boot">Opening your workbench…</div></main>
      <div id="toast" role="status" aria-live="polite" />
      <Script src="/app.js" strategy="afterInteractive" type="module" />
    </>
  );
}

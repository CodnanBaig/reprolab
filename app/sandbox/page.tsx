import Script from 'next/script';

export const metadata = { title: 'ReproLab • Recording sandbox' };

export default function SandboxPage() {
  return (
    <div className="sandbox-body">
      <div className="recorder-bar" data-repro-ignore="">
        <a className="brand" href="/"><img src="/icon.svg" alt="" width="25" height="25" /> ReproLab <span className="muted">/ Sandbox</span></a>
        <div className="rec-controls">
          <span id="rec-state">Ready to record</span>
          <button className="btn primary" id="record-start">Start recording</button>
          <button className="btn danger" id="record-stop" hidden>Stop &amp; save</button>
          <a className="btn" id="view-session" href="/" hidden>Open replay</a>
        </div>
      </div>
      <main className="sandbox-main">
        <div className="sandbox-guide" data-repro-ignore="">
          <div>
            <h1>Make it break. See the whole story.</h1>
            <p>This is an intentionally broken checkout. Start recording, add the lamp, then check out. Your input values stay masked.</p>
          </div>
          <span className="pill">Interactive fixture</span>
        </div>
        <section className="shop" id="shop">
          <header className="shop-nav">
            <strong data-repro-public="">orbit<span className="shop-dot" /></strong>
            <nav><span data-repro-public="">Objects for everyday</span><button data-repro-public="" data-testid="bag" id="bag">Bag <span id="bag-count" data-repro-public="">0</span></button></nav>
          </header>
          <div className="shop-grid">
            <div className="lamp-scene"><div className="lamp-halo" /><div className="lamp-shade" /><div className="lamp-stem" /><div className="lamp-base" /><span data-repro-public="">Designed to slow things down.</span></div>
            <div className="product-info">
              <span className="product-tag" data-repro-public="">LIGHTING / COLLECTION 04</span>
              <h2 data-repro-public="">The afternoon lamp.</h2>
              <p className="product-price" data-repro-public="">$89.00</p>
              <p className="product-copy" data-repro-public="">A little warmth for your desk. Powder-coated steel, a considered curve, and light exactly where you need it.</p>
              <div className="swatches"><button aria-label="Choose ochre" className="swatch ochre selected" data-testid="color-ochre" id="color-ochre" /><button aria-label="Choose forest" className="swatch forest" data-testid="color-forest" id="color-forest" /><span id="color-label" data-repro-public="">Ochre</span></div>
              <button className="shop-button" id="add-to-bag" data-testid="add-to-bag" data-repro-public="">Add to bag</button>
              <p className="shop-fine" data-repro-public="">Free shipping. Thoughtfully packaged.</p>
              <div className="checkout" id="checkout" hidden>
                <h3 data-repro-public="">Your bag is ready.</h3>
                <label htmlFor="customer-email" data-repro-public="">Email for your receipt</label>
                <input type="email" id="customer-email" data-testid="customer-email" placeholder="you@example.com" autoComplete="off" />
                <button id="checkout-button" data-testid="checkout-button" className="shop-button" data-repro-public="">Complete checkout</button>
                <p id="checkout-result" role="status" data-repro-public="" />
              </div>
            </div>
          </div>
          <footer className="shop-footer"><span data-repro-public="">Less, but better.</span><span data-repro-public="">Objects with a point of view.</span></footer>
        </section>
        <section className="sandbox-explain" data-repro-ignore="">
          <div><h3>What gets captured</h3><p>Clicks, route changes, errors, HTTP status and a sanitized visual reconstruction.</p></div>
          <div><h3>What stays out</h3><p>Input values, cookies, headers, bodies and text that is not explicitly marked public.</p></div>
          <div><h3>What the test proves</h3><p>The generated regression draft fails while this checkout throws. Fix the bug; make it green.</p></div>
        </section>
      </main>
      <div id="toast" role="status" aria-live="polite" />
      <Script src="/sdk/reprolab.js" strategy="afterInteractive" />
      <Script src="/sandbox.js" strategy="afterInteractive" type="module" />
    </div>
  );
}

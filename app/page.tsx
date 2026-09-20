import { WorkbenchScript } from './legacy-scripts';

export default function WorkbenchPage() {
  return (
    <>
      <main id="app"><div className="boot">Opening your workbench…</div></main>
      <div id="toast" role="status" aria-live="polite" />
      <WorkbenchScript />
    </>
  );
}

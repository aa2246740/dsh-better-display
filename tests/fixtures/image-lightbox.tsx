import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageLightbox } from '../../src/client/ImageLightbox.js';

const svg = (width: number, height: number, fill: string): string => {
  const document = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${fill}"/><circle cx="${Math.round(width / 4)}" cy="${Math.round(height / 3)}" r="${Math.max(8, Math.round(Math.min(width, height) / 12))}" fill="#fc0"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(document)}`;
};

const PICTURES = {
  large: svg(2000, 1200, '#246'),
  small: svg(200, 120, '#284')
};

function Harness(): ReactElement {
  const largeOpener = useRef<HTMLButtonElement>(null);
  const smallOpener = useRef<HTMLButtonElement>(null);
  const [which, setWhich] = useState<'large' | 'small' | null>(null);
  const openKind = useRef<'large' | 'small' | null>(null);
  // Removing an open modal dialog drops focus on the body after the close handler
  // has focused the button. Put it back once the dialog is gone, same as ImageBlock.
  useLayoutEffect(() => {
    const previous = openKind.current;
    if (previous !== null && which === null) {
      const opener = previous === 'small' ? smallOpener.current : largeOpener.current;
      opener?.focus();
    }
    openKind.current = which;
  }, [which]);
  const close = (): void => {
    const opener = which === 'small' ? smallOpener.current : largeOpener.current;
    setWhich(null);
    opener?.focus();
  };
  return (
    <>
      <button id="open-large" ref={largeOpener} type="button" onClick={() => setWhich('large')}>
        open large
      </button>
      <button id="open-small" ref={smallOpener} type="button" onClick={() => setWhich('small')}>
        open small
      </button>
      {which !== null && (
        <ImageLightbox
          open
          src={PICTURES[which]}
          alt={which}
          caption={which === 'large' ? 'large.png' : 'small.png'}
          onClose={close}
        />
      )}
    </>
  );
}

const app = document.getElementById('app');
if (app === null) throw new Error('missing #app');
createRoot(app).render(<Harness />);

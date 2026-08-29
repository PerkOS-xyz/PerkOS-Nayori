'use client';

import { useEffect, useId, useState } from 'react';

const STACKS_ORANGE = '#FC6432';

export function Mermaid({ chart, label }: { chart: string; label: string }) {
  const reactId = useId();
  const id = `nayori-mermaid-${reactId.replace(/[^a-zA-Z0-9-_]/g, '')}`;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            primaryColor: '#FFF1EB',
            primaryBorderColor: STACKS_ORANGE,
            primaryTextColor: '#161616',
            secondaryColor: '#FFE2D7',
            tertiaryColor: '#FFF8F5',
            lineColor: STACKS_ORANGE,
            actorBkg: '#FFF1EB',
            actorBorder: STACKS_ORANGE,
            signalColor: STACKS_ORANGE,
            noteBkgColor: '#FFE2D7',
            noteBorderColor: STACKS_ORANGE,
            fontFamily: 'Inter, Arial, sans-serif',
          },
        });
        const rendered = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered.svg);
      } catch {
        if (!cancelled) setError('The architecture diagram could not be rendered.');
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  return (
    <figure className="mermaid-shell not-prose" aria-label={label}>
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="h-44 animate-pulse rounded-lg bg-fd-muted" aria-label="Loading diagram" />
      )}
      <figcaption className="mt-3 text-center text-xs text-fd-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export { STACKS_ORANGE };

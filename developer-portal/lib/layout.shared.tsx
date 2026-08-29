import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BookOpenText, Boxes, Code2, ExternalLink } from 'lucide-react';
import { gitConfig, productLinks } from './shared';
import { NayoriLogo, PerkOSLogo } from '@/components/nayori-logo';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: (
        <span className="flex items-center gap-2 font-semibold">
          <NayoriLogo className="size-7" />
          <span>Nayori</span>
          <span className="hidden text-xs font-medium text-fd-muted-foreground sm:inline">Docs</span>
          <span className="hidden items-center gap-1 border-l border-fd-border pl-2 text-[10px] font-medium text-fd-muted-foreground lg:inline-flex">
            by <PerkOSLogo /> PerkOS
          </span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        icon: <BookOpenText />,
        text: 'API Reference',
        url: '/reference/api',
        active: 'nested-url',
      },
      {
        icon: <Boxes />,
        text: 'Agent SDK',
        url: productLinks.sdk,
        external: true,
      },
      {
        icon: <ExternalLink />,
        text: 'Open App',
        url: productLinks.app,
        external: true,
      },
      {
        icon: <Code2 />,
        text: 'GitHub',
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        external: true,
        on: 'menu',
      },
    ],
  };
}

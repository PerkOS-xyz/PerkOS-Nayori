"use client";

import { useEffect } from "react";
import {
  nayoriWebMcpToolSpecs,
  webMcpInputSchema,
} from "../constants/webmcp";

type WebMcpExecuteOptions = {
  signal?: AbortSignal;
};

type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: true;
    untrustedContentHint: false;
  };
  execute: (
    input: Record<string, unknown>,
    options?: WebMcpExecuteOptions
  ) => Promise<string>;
};

type ModelContext = {
  provideContext?: (context: { tools: WebMcpTool[] }) => void;
  registerTool?: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal }
  ) => Promise<unknown> | unknown;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }

  interface Navigator {
    modelContext?: ModelContext;
  }
}

function buildWebMcpTools(): WebMcpTool[] {
  return nayoriWebMcpToolSpecs.map((spec) => ({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: webMcpInputSchema,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
    },
    async execute(_input, options) {
      const response = await fetch(spec.path, {
        headers: { Accept: "*/*" },
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`${response.status} fetching ${spec.path}`);
      }

      return response.text();
    },
  }));
}

export const nayoriWebMcpTools = buildWebMcpTools();

function getModelContexts(): ModelContext[] {
  const candidates = [document.modelContext, navigator.modelContext];
  return candidates.filter(
    (context, index): context is ModelContext =>
      Boolean(context?.registerTool || context?.provideContext) &&
      candidates.indexOf(context) === index
  );
}

export default function WebMcpProvider() {
  useEffect(() => {
    const controller = new AbortController();

    for (const context of getModelContexts()) {
      if (typeof context.registerTool === "function") {
        for (const tool of buildWebMcpTools()) {
          try {
            Promise.resolve(
              context.registerTool(tool, { signal: controller.signal })
            ).catch(() => undefined);
          } catch {
            // The pre-hydration bootstrap may already own this public name.
          }
        }
      } else if (typeof context.provideContext === "function") {
        context.provideContext({ tools: buildWebMcpTools() });
      }
    }

    return () => controller.abort();
  }, []);

  return null;
}

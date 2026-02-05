'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  code: string;
  highlightNodeId?: string;
  className?: string;
}

let renderCounter = 0;

function getTheme(): 'dark' | 'default' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'default';
}

function configureMermaid(theme: 'dark' | 'default') {
  mermaid.initialize({
    startOnLoad: false,
    theme,
    themeVariables:
      theme === 'dark'
        ? {
            primaryColor: '#4c1d95',
            primaryTextColor: '#e9d5ff',
            primaryBorderColor: '#7c3aed',
            lineColor: '#6b7280',
            secondaryColor: '#1e1b4b',
            tertiaryColor: '#312e81',
          }
        : {
            primaryColor: '#ede9fe',
            primaryTextColor: '#4c1d95',
            primaryBorderColor: '#8b5cf6',
            lineColor: '#9ca3af',
            secondaryColor: '#f5f3ff',
            tertiaryColor: '#ddd6fe',
          },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
    },
  });
}

function MermaidDiagramInner({ code, highlightNodeId, className = '' }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string>(`mmd-${++renderCounter}`);
  const prevThemeRef = useRef<string | null>(null);

  const renderDiagram = useCallback(async () => {
    const theme = getTheme();

    // Re-initialize mermaid when theme changes
    if (prevThemeRef.current !== theme) {
      configureMermaid(theme);
      prevThemeRef.current = theme;
    }

    let finalCode = code;
    if (highlightNodeId) {
      finalCode += `\n    classDef highlight fill:#8b5cf6,stroke:#6d28d9,color:#fff,stroke-width:3px`;
      finalCode += `\n    class ${highlightNodeId} highlight`;
    }

    // Use a unique ID per render to avoid mermaid ID collision
    const renderId = `${idRef.current}-${++renderCounter}`;

    try {
      // Remove any stale element mermaid may have created
      const stale = document.getElementById(renderId);
      if (stale) stale.remove();

      const { svg: rendered } = await mermaid.render(renderId, finalCode);
      setSvg(rendered);
      setError(null);
    } catch (err) {
      // mermaid creates a broken element on failure — clean it up
      const broken = document.getElementById(renderId);
      if (broken) broken.remove();
      setError(err instanceof Error ? err.message : 'Failed to render diagram');
    }
  }, [code, highlightNodeId]);

  // Render on mount and when inputs change
  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  // Watch for theme (dark class) changes on <html>
  useEffect(() => {
    const observer = new MutationObserver(() => {
      renderDiagram();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [renderDiagram]);

  if (error) {
    return (
      <div className={`text-sm text-muted p-4 ${className}`}>
        Failed to render diagram
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={`flex justify-center items-center h-48 text-sm text-muted ${className}`}>
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      className={`flex justify-center [&_svg]:max-w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default MermaidDiagramInner;

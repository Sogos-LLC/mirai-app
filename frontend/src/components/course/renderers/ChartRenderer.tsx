'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
}

export interface ChartContent {
  type: string; // bar, line, pie, donut, table
  title: string;
  series: ChartSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  description?: string;
}

interface ChartRendererProps {
  content: ChartContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: ChartContent) => void;
}

// Simple bar chart using CSS
function SimpleBarChart({ series, maxValue }: { series: ChartSeries[]; maxValue: number }) {
  const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-4">
      {series.map((s, seriesIdx) => (
        <div key={seriesIdx}>
          {series.length > 1 && (
            <p className="text-sm font-medium text-secondary mb-2">{s.name}</p>
          )}
          <div className="space-y-2">
            {s.data.map((point, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="w-24 text-sm text-secondary truncate">{point.label}</span>
                <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${(point.value / maxValue) * 100}%`,
                      backgroundColor: point.color || colors[seriesIdx % colors.length],
                    }}
                  />
                </div>
                <span className="w-12 text-sm text-right text-primary">{point.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Simple pie chart using CSS conic-gradient
function SimplePieChart({ series }: { series: ChartSeries[] }) {
  const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

  if (series.length === 0 || series[0].data.length === 0) return null;

  const data = series[0].data;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Build conic-gradient
  let gradientParts: string[] = [];
  let currentAngle = 0;

  data.forEach((d, idx) => {
    const angle = (d.value / total) * 360;
    const color = d.color || colors[idx % colors.length];
    gradientParts.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);
    currentAngle += angle;
  });

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      <div
        className="w-48 h-48 rounded-full"
        style={{
          background: `conic-gradient(${gradientParts.join(', ')})`,
        }}
      />
      <div className="space-y-2">
        {data.map((d, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: d.color || colors[idx % colors.length] }}
            />
            <span className="text-sm text-primary">{d.label}</span>
            <span className="text-sm text-muted">({((d.value / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Table view
function TableChart({ series, title }: { series: ChartSeries[]; title: string }) {
  if (series.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-default">
            <th className="py-2 px-4 text-left text-sm font-semibold text-primary">Category</th>
            {series.map((s, idx) => (
              <th key={idx} className="py-2 px-4 text-right text-sm font-semibold text-primary">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series[0].data.map((point, rowIdx) => (
            <tr key={rowIdx} className="border-b border-subtle">
              <td className="py-2 px-4 text-sm text-secondary">{point.label}</td>
              {series.map((s, colIdx) => (
                <td key={colIdx} className="py-2 px-4 text-sm text-right text-primary">
                  {s.data[rowIdx]?.value ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartRenderer({ content: rawContent, isEditing = false }: ChartRendererProps) {
  const content = rawContent as ChartContent;

  // Calculate max value for bar charts
  const maxValue = content.series.reduce((max, series) => {
    const seriesMax = series.data.reduce((m, d) => Math.max(m, d.value), 0);
    return Math.max(max, seriesMax);
  }, 0);

  const renderChart = () => {
    switch (content.type) {
      case 'bar':
        return <SimpleBarChart series={content.series} maxValue={maxValue} />;
      case 'pie':
      case 'donut':
        return <SimplePieChart series={content.series} />;
      case 'table':
        return <TableChart series={content.series} title={content.title} />;
      case 'line':
        // For line charts, fall back to table view in basic renderer
        return <TableChart series={content.series} title={content.title} />;
      default:
        return <SimpleBarChart series={content.series} maxValue={maxValue} />;
    }
  };

  return (
    <div className="my-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        <h4 className="font-semibold text-primary">{content.title}</h4>
      </div>

      {renderChart()}

      {content.description && (
        <p className="mt-4 text-sm text-secondary">{content.description}</p>
      )}

      {(content.xAxisLabel || content.yAxisLabel) && (
        <div className="mt-2 flex gap-4 text-xs text-muted">
          {content.xAxisLabel && <span>X: {content.xAxisLabel}</span>}
          {content.yAxisLabel && <span>Y: {content.yAxisLabel}</span>}
        </div>
      )}
    </div>
  );
}

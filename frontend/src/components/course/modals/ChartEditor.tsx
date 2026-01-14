'use client';

import { useState } from 'react';
import { Plus, Trash2, BarChart3, TrendingUp, PieChart, Table } from 'lucide-react';

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
}

interface ChartContent {
  type: string;
  title: string;
  series: ChartSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  description?: string;
}

interface ChartEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'pie', label: 'Pie', icon: PieChart },
  { value: 'table', label: 'Table', icon: Table },
];

const DEFAULT_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export function ChartEditor({ contentJson, onSave }: ChartEditorProps) {
  const parsed = JSON.parse(contentJson) as ChartContent;
  const [type, setType] = useState(parsed.type || 'bar');
  const [title, setTitle] = useState(parsed.title || '');
  const [series, setSeries] = useState<ChartSeries[]>(
    parsed.series?.length
      ? parsed.series
      : [{ name: 'Series 1', data: [{ label: '', value: 0 }] }]
  );
  const [xAxisLabel, setXAxisLabel] = useState(parsed.xAxisLabel || '');
  const [yAxisLabel, setYAxisLabel] = useState(parsed.yAxisLabel || '');
  const [description, setDescription] = useState(parsed.description || '');

  const handleSave = () => {
    onSave(JSON.stringify({
      type,
      title,
      series: series.map((s) => ({
        ...s,
        data: s.data.filter((d) => d.label.trim()),
      })).filter((s) => s.data.length > 0),
      xAxisLabel: xAxisLabel || undefined,
      yAxisLabel: yAxisLabel || undefined,
      description: description || undefined,
    }));
  };

  const addDataPoint = (seriesIndex: number) => {
    const updated = [...series];
    updated[seriesIndex].data.push({ label: '', value: 0 });
    setSeries(updated);
  };

  const removeDataPoint = (seriesIndex: number, dataIndex: number) => {
    const updated = [...series];
    if (updated[seriesIndex].data.length > 1) {
      updated[seriesIndex].data = updated[seriesIndex].data.filter((_, i) => i !== dataIndex);
      setSeries(updated);
    }
  };

  const updateDataPoint = (seriesIndex: number, dataIndex: number, field: keyof ChartDataPoint, value: string | number) => {
    const updated = [...series];
    updated[seriesIndex].data[dataIndex] = {
      ...updated[seriesIndex].data[dataIndex],
      [field]: value,
    };
    setSeries(updated);
  };

  const updateSeriesName = (seriesIndex: number, name: string) => {
    const updated = [...series];
    updated[seriesIndex].name = name;
    setSeries(updated);
  };

  const addSeries = () => {
    setSeries([...series, { name: `Series ${series.length + 1}`, data: [{ label: '', value: 0 }] }]);
  };

  const removeSeries = (index: number) => {
    if (series.length > 1) {
      setSeries(series.filter((_, i) => i !== index));
    }
  };

  const showMultipleSeries = type === 'bar' || type === 'line' || type === 'table';

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Chart Type
        </label>
        <div className="grid grid-cols-4 gap-2">
          {CHART_TYPES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.value}
                onClick={() => setType(c.value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                  type === c.value
                    ? 'bg-purple-100 text-purple-600 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700'
                    : 'bg-hover text-muted border-transparent hover:border-subtle'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Chart Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="e.g., Sales by Quarter"
        />
      </div>

      {(type === 'bar' || type === 'line') && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              X-Axis Label (optional)
            </label>
            <input
              type="text"
              value={xAxisLabel}
              onChange={(e) => setXAxisLabel(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-default rounded-lg
                focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                text-primary placeholder:text-muted"
              placeholder="e.g., Month"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              Y-Axis Label (optional)
            </label>
            <input
              type="text"
              value={yAxisLabel}
              onChange={(e) => setYAxisLabel(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-default rounded-lg
                focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                text-primary placeholder:text-muted"
              placeholder="e.g., Revenue ($)"
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-primary">Data</label>
          {showMultipleSeries && (
            <button
              onClick={addSeries}
              className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
            >
              <Plus className="w-4 h-4" />
              Add Series
            </button>
          )}
        </div>

        <div className="space-y-4">
          {series.slice(0, showMultipleSeries ? series.length : 1).map((s, seriesIndex) => (
            <div key={seriesIndex} className="p-4 bg-surface border border-default rounded-lg">
              {showMultipleSeries && (
                <div className="flex justify-between items-center mb-3">
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => updateSeriesName(seriesIndex, e.target.value)}
                    className="px-2 py-1 bg-transparent border-b border-default text-sm font-medium
                      focus:outline-none focus:border-purple-500 text-primary"
                    placeholder="Series Name"
                  />
                  {series.length > 1 && (
                    <button
                      onClick={() => removeSeries(seriesIndex)}
                      className="text-muted hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {s.data.map((point, dataIndex) => (
                  <div key={dataIndex} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={point.label}
                      onChange={(e) => updateDataPoint(seriesIndex, dataIndex, 'label', e.target.value)}
                      className="flex-1 px-3 py-2 bg-surface border border-default rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm
                        text-primary placeholder:text-muted"
                      placeholder="Label"
                    />
                    <input
                      type="number"
                      value={point.value}
                      onChange={(e) => updateDataPoint(seriesIndex, dataIndex, 'value', parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-2 bg-surface border border-default rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm
                        text-primary placeholder:text-muted"
                      placeholder="Value"
                    />
                    {(type === 'pie' || type === 'bar') && (
                      <input
                        type="color"
                        value={point.color || DEFAULT_COLORS[dataIndex % DEFAULT_COLORS.length]}
                        onChange={(e) => updateDataPoint(seriesIndex, dataIndex, 'color', e.target.value)}
                        className="w-10 h-10 p-1 bg-surface border border-default rounded-lg cursor-pointer"
                      />
                    )}
                    <button
                      onClick={() => removeDataPoint(seriesIndex, dataIndex)}
                      disabled={s.data.length <= 1}
                      className="p-2 text-muted hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addDataPoint(seriesIndex)}
                className="mt-2 flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
              >
                <Plus className="w-4 h-4" />
                Add Data Point
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Accessibility Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="Describe the chart for screen readers..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          disabled={!title.trim() || series.every((s) => s.data.every((d) => !d.label.trim()))}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

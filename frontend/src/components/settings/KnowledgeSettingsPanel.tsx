'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Save, Database, Shield, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  useGetKnowledgeSettings,
  useUpdateKnowledgeSettings,
  type KnowledgeSettings,
} from '@/hooks/useTenantSettings';

interface ToggleOptionProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleOption({ label, description, checked, onChange, disabled }: ToggleOptionProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border last:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <p className="font-medium text-primary">{label}</p>
        <p className="text-sm text-secondary">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <div className="w-11 h-6 bg-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-dark-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed" />
      </label>
    </div>
  );
}

interface SliderOptionProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  disabled?: boolean;
}

function SliderOption({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  formatValue = (v) => v.toString(),
  disabled,
}: SliderOptionProps) {
  return (
    <div className="py-4 border-b border last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-primary">{label}</p>
          <p className="text-sm text-secondary">{description}</p>
        </div>
        <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 ml-4">
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-hover rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}

export function KnowledgeSettingsPanel() {
  const { data: settings, isLoading, error, refetch } = useGetKnowledgeSettings();
  const updateSettings = useUpdateKnowledgeSettings();

  // Local state for form
  const [localSettings, setLocalSettings] = useState<Partial<KnowledgeSettings>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync local state with fetched settings
  useEffect(() => {
    if (settings) {
      setLocalSettings({
        allowGlobalKnowledge: settings.allowGlobalKnowledge,
        lowGroundingThreshold: settings.lowGroundingThreshold,
        enforceInternalOnly: settings.enforceInternalOnly,
        requireCurriculumApproval: settings.requireCurriculumApproval,
      });
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = <K extends keyof KnowledgeSettings>(
    key: K,
    value: KnowledgeSettings[K]
  ) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutate({
        allowGlobalKnowledge: localSettings.allowGlobalKnowledge,
        lowGroundingThreshold: localSettings.lowGroundingThreshold,
        enforceInternalOnly: localSettings.enforceInternalOnly,
        requireCurriculumApproval: localSettings.requireCurriculumApproval,
      });
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleReset = () => {
    if (settings) {
      setLocalSettings({
        allowGlobalKnowledge: settings.allowGlobalKnowledge,
        lowGroundingThreshold: settings.lowGroundingThreshold,
        enforceInternalOnly: settings.enforceInternalOnly,
        requireCurriculumApproval: settings.requireCurriculumApproval,
      });
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-primary mb-2">Failed to load settings</h3>
        <p className="text-secondary mb-4">{error.message}</p>
        <Button variant="secondary" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-primary">Knowledge Settings</h2>
          <p className="text-secondary text-sm mt-1">
            Configure how AI uses knowledge sources for course generation
          </p>
        </div>
        {saveSuccess && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">Saved</span>
          </div>
        )}
      </div>

      {/* Knowledge Access */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle>Knowledge Access</CardTitle>
              <CardDescription>Control which knowledge sources courses can use</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ToggleOption
            label="Allow Global Knowledge"
            description="Courses can access tenant-wide knowledge sources in addition to team-specific ones"
            checked={localSettings.allowGlobalKnowledge ?? true}
            onChange={(checked) => handleChange('allowGlobalKnowledge', checked)}
            disabled={updateSettings.isLoading}
          />
          <ToggleOption
            label="Enforce Internal Data Only"
            description="When enabled, AI cannot synthesize content - all generation must be grounded in knowledge sources"
            checked={localSettings.enforceInternalOnly ?? false}
            onChange={(checked) => handleChange('enforceInternalOnly', checked)}
            disabled={updateSettings.isLoading}
          />
        </CardContent>
      </Card>

      {/* Quality Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle>Quality Controls</CardTitle>
              <CardDescription>Set thresholds and approval requirements</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SliderOption
            label="Low Grounding Warning Threshold"
            description="Show warning when content grounding score falls below this level"
            value={localSettings.lowGroundingThreshold ?? 0.6}
            min={0.3}
            max={0.9}
            step={0.05}
            onChange={(value) => handleChange('lowGroundingThreshold', value)}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            disabled={updateSettings.isLoading}
          />
          <ToggleOption
            label="Require Curriculum Map Approval"
            description="Users must approve the curriculum coverage map before generating lessons"
            checked={localSettings.requireCurriculumApproval ?? true}
            onChange={(checked) => handleChange('requireCurriculumApproval', checked)}
            disabled={updateSettings.isLoading}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      {hasChanges && (
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={updateSettings.isLoading}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={updateSettings.isLoading}
          >
            {updateSettings.isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error Display */}
      {updateSettings.error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{updateSettings.error.message}</span>
        </div>
      )}
    </div>
  );
}

export default KnowledgeSettingsPanel;

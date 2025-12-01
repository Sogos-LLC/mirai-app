'use client';

import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  openApiKeyModal,
  closeApiKeyModal,
  startApiKeyTest,
  apiKeyTestSuccess,
  apiKeyTestFailed,
  resetApiKeyTest,
  toggleUsageExpanded,
  setUsageTimeRange,
} from '@/store/slices/tenantSettingsSlice';
import type { RootState } from '@/store';
import type { TenantAISettings, AIProvider, UsageByType } from '@/gen/mirai/v1/tenant_settings_pb';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

interface AISettingsPanelProps {
  settings: TenantAISettings | null;
  usageStats?: {
    totalTokensUsed: bigint;
    tokensThisMonth: bigint;
    monthlyLimit?: bigint;
    usageByType: UsageByType[];
  };
  isLoading?: boolean;
  onSetApiKey: (provider: AIProvider, apiKey: string) => Promise<void>;
  onTestApiKey: (provider: AIProvider, apiKey: string) => Promise<{ valid: boolean; errorMessage?: string }>;
  onRemoveApiKey: () => Promise<void>;
}

const PROVIDER_CONFIG: Record<number, { name: string; description: string; docsUrl: string }> = {
  0: { name: 'Not Configured', description: 'Select an AI provider', docsUrl: '' },
  1: { name: 'Google Gemini', description: 'Google Gemini 2.0 Flash for AI generation', docsUrl: 'https://ai.google.dev/docs' },
};

function formatTokens(tokens: bigint | number): string {
  const num = Number(tokens);
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function AISettingsPanel({
  settings,
  usageStats,
  isLoading = false,
  onSetApiKey,
  onTestApiKey,
  onRemoveApiKey,
}: AISettingsPanelProps) {
  const dispatch = useDispatch();
  const {
    isApiKeyModalOpen,
    isTestingApiKey,
    apiKeyTestStatus,
    apiKeyTestError,
    isUsageExpanded,
    usageTimeRange,
  } = useSelector((state: RootState) => state.tenantSettings);

  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<AIProvider>(1); // Default to Gemini
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const providerConfig = settings ? PROVIDER_CONFIG[settings.provider] : PROVIDER_CONFIG[0];

  const handleOpenModal = () => {
    setApiKey('');
    dispatch(resetApiKeyTest());
    dispatch(openApiKeyModal());
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) return;
    dispatch(startApiKeyTest());
    try {
      const result = await onTestApiKey(provider, apiKey);
      if (result.valid) {
        dispatch(apiKeyTestSuccess());
      } else {
        dispatch(apiKeyTestFailed(result.errorMessage || 'Invalid API key'));
      }
    } catch (error) {
      dispatch(apiKeyTestFailed(error instanceof Error ? error.message : 'Test failed'));
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await onSetApiKey(provider, apiKey);
      dispatch(closeApiKeyModal());
    } catch (error) {
      dispatch(apiKeyTestFailed(error instanceof Error ? error.message : 'Failed to save API key'));
    }
  };

  const handleRemoveKey = async () => {
    try {
      await onRemoveApiKey();
      setShowRemoveConfirm(false);
    } catch (error) {
      console.error('Failed to remove API key:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">AI Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure AI provider settings for course generation. Only admins can modify these settings.
        </p>
      </div>

      {/* API Key Status */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">AI Provider</h3>
            <p className="text-sm text-gray-500">{providerConfig.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {settings?.apiKeyConfigured ? (
              <>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Configured
                </span>
                <button
                  onClick={handleOpenModal}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Update Key
                </button>
                <button
                  onClick={() => setShowRemoveConfirm(true)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  Not Configured
                </span>
                <button
                  onClick={handleOpenModal}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Configure API Key
                </button>
              </>
            )}
          </div>
        </div>

        {/* Provider Info */}
        {settings?.apiKeyConfigured && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">{providerConfig.description}</p>
            {providerConfig.docsUrl && (
              <a
                href={providerConfig.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 inline-flex items-center"
              >
                View documentation
                <svg className="ml-1 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Usage Stats */}
      {settings?.apiKeyConfigured && usageStats && (
        <div className="px-6 py-4">
          <button
            onClick={() => dispatch(toggleUsageExpanded())}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-sm font-medium text-gray-900">Token Usage</h3>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isUsageExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isUsageExpanded && (
            <div className="mt-4 space-y-4">
              {/* Usage Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">This Month</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatTokens(usageStats.tokensThisMonth)}
                  </p>
                  {usageStats.monthlyLimit && (
                    <p className="text-xs text-gray-500">
                      of {formatTokens(usageStats.monthlyLimit)} limit
                    </p>
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total All Time</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatTokens(usageStats.totalTokensUsed)}
                  </p>
                </div>
              </div>

              {/* Usage Progress */}
              {usageStats.monthlyLimit && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Monthly usage</span>
                    <span>
                      {((Number(usageStats.tokensThisMonth) / Number(usageStats.monthlyLimit)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        Number(usageStats.tokensThisMonth) / Number(usageStats.monthlyLimit) > 0.9
                          ? 'bg-red-500'
                          : Number(usageStats.tokensThisMonth) / Number(usageStats.monthlyLimit) > 0.7
                          ? 'bg-amber-500'
                          : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (Number(usageStats.tokensThisMonth) / Number(usageStats.monthlyLimit)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Usage by Type */}
              {usageStats.usageByType.length > 0 && (
                <div>
                  <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-2">By Job Type</h4>
                  <div className="space-y-2">
                    {usageStats.usageByType.map((usage) => (
                      <div
                        key={usage.jobType}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-700">{usage.jobType}</span>
                        <span className="text-gray-500">
                          {formatTokens(usage.tokensUsed)} ({usage.jobCount} jobs)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Remove Confirmation */}
      {showRemoveConfirm && (
        <div className="px-6 py-4 bg-red-50 border-t border-red-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-700">
              Are you sure you want to remove the API key? AI features will be disabled.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveKey}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Remove Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {isApiKeyModalOpen && (
        <ResponsiveModal
          isOpen={true}
          onClose={() => dispatch(closeApiKeyModal())}
          title={settings?.apiKeyConfigured ? 'Update API Key' : 'Configure API Key'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(parseInt(e.target.value, 10) as AIProvider)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={1}>Google Gemini</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Currently only Google Gemini is supported
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Your API key will be encrypted and stored securely
              </p>
            </div>

            {/* Test Status */}
            {apiKeyTestStatus === 'success' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700 flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  API key is valid!
                </p>
              </div>
            )}
            {apiKeyTestStatus === 'failed' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">{apiKeyTestError || 'API key validation failed'}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => dispatch(closeApiKeyModal())}
                className="w-full sm:w-auto px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTestKey}
                disabled={!apiKey.trim() || isTestingApiKey}
                className="w-full sm:w-auto px-4 py-2 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium disabled:opacity-50"
              >
                {isTestingApiKey ? 'Testing...' : 'Test Key'}
              </button>
              <button
                type="button"
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || apiKeyTestStatus !== 'success'}
                className="w-full sm:w-auto px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
              >
                Save Key
              </button>
            </div>
          </div>
        </ResponsiveModal>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { User, Bell, Lock, Palette, Globe, CreditCard, ChevronRight } from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User, description: 'Name, email, and bio' },
    { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Email and push settings' },
    { id: 'security', label: 'Security', icon: Lock, description: 'Password and 2FA' },
    { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme settings' },
    { id: 'language', label: 'Language', icon: Globe, description: 'Language and timezone' },
    { id: 'billing', label: 'Billing', icon: CreditCard, description: 'Plan and payment' },
  ];

  // Mobile: Show tab list when no tab selected (or show content)
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  const handleTabSelect = (tabId: string) => {
    setActiveTab(tabId);
    setShowMobileMenu(false);
  };

  const handleBackToMenu = () => {
    setShowMobileMenu(true);
  };

  const activeTabData = tabs.find(t => t.id === activeTab);

  return (
    <>
      {/* Page Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1 lg:mb-2">Settings</h1>
        <p className="text-sm lg:text-base text-gray-600">Manage your account and preferences</p>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Mobile: Tab Menu (full screen list) */}
        <div className={`lg:hidden ${showMobileMenu ? 'block' : 'hidden'}`}>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {tabs.map((tab, idx) => {
              const Icon = tab.icon;
              const isLast = idx === tabs.length - 1;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabSelect(tab.id)}
                  className={`w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                    !isLast ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    activeTab === tab.id ? 'bg-primary-100' : 'bg-gray-100'
                  }`}>
                    <Icon className={`w-5 h-5 ${
                      activeTab === tab.id ? 'text-primary-600' : 'text-gray-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{tab.label}</p>
                    <p className="text-sm text-gray-500 truncate">{tab.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile: Content View (when tab selected) */}
        <div className={`lg:hidden ${!showMobileMenu ? 'block' : 'hidden'}`}>
          {/* Back button */}
          <button
            onClick={handleBackToMenu}
            className="flex items-center gap-2 text-primary-600 font-medium mb-4 min-h-[44px]"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            Back to Settings
          </button>

          {/* Content card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {renderTabContent()}
          </div>
        </div>

        {/* Desktop: Sidebar Tabs */}
        <div className="hidden lg:block w-64 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-100 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Desktop: Content Panel */}
        <div className="hidden lg:block flex-1 bg-white border border-gray-200 rounded-xl p-8">
          {renderTabContent()}
        </div>
      </div>
    </>
  );

  function renderTabContent() {
    switch (activeTab) {
      case 'profile':
        return (
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-4 lg:mb-6">
              Profile Settings
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bio
                </label>
                <textarea
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base"
                  placeholder="Tell us about yourself..."
                />
              </div>
              <button className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 font-medium">
                Save Changes
              </button>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-4 lg:mb-6">
              Notification Preferences
            </h2>
            <div className="space-y-1">
              {[
                { label: 'Email notifications', desc: 'Receive email updates' },
                { label: 'Push notifications', desc: 'Get push alerts' },
                { label: 'Product updates', desc: 'New features info' },
                { label: 'Marketing emails', desc: 'Tips and promotions' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-medium text-gray-900">{item.label}</p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        );

      case 'security':
        return (
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-4 lg:mb-6">
              Security Settings
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Change Password</h3>
                <div className="space-y-3">
                  <input
                    type="password"
                    placeholder="Current password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base"
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base"
                  />
                  <button className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 font-medium">
                    Update Password
                  </button>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-gray-900 mb-2">Two-Factor Authentication</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Add an extra layer of security to your account
                </p>
                <button className="w-full border border-primary-600 text-primary-600 px-6 py-3 rounded-lg hover:bg-primary-50 font-medium">
                  Enable 2FA
                </button>
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-4 lg:mb-6">
              Appearance
            </h2>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Theme</h3>
              <div className="grid grid-cols-3 gap-3">
                {['Light', 'Dark', 'System'].map((theme) => (
                  <button
                    key={theme}
                    className="border-2 border-gray-300 rounded-lg p-3 hover:border-primary-600 transition-colors"
                  >
                    <div
                      className={`h-16 rounded mb-2 ${
                        theme === 'Dark'
                          ? 'bg-gray-800'
                          : 'bg-white border border-gray-200'
                      }`}
                    ></div>
                    <p className="font-medium text-center text-sm">{theme}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'language':
        return (
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-4 lg:mb-6">
              Language & Region
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Language
                </label>
                <select className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base bg-white">
                  <option>English (US)</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>German</option>
                  <option>Japanese</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Timezone
                </label>
                <select className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base bg-white">
                  <option>Eastern Time (ET)</option>
                  <option>Central Time (CT)</option>
                  <option>Mountain Time (MT)</option>
                  <option>Pacific Time (PT)</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 'billing':
        return (
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-4 lg:mb-6">
              Billing & Subscription
            </h2>
            <div className="space-y-4">
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Pro Plan</h3>
                    <p className="text-gray-600">$49/month</p>
                  </div>
                  <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    Active
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Next billing: November 17, 2025
                </p>
                <button className="text-primary-600 font-medium text-sm">
                  Manage Subscription
                </button>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Payment Method</h3>
                <div className="border border-gray-300 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-8 bg-gray-200 rounded"></div>
                    <div>
                      <p className="font-medium">•••• 4242</p>
                      <p className="text-sm text-gray-600">Expires 12/26</p>
                    </div>
                  </div>
                  <button className="text-primary-600 text-sm font-medium px-3 py-2">
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }
}

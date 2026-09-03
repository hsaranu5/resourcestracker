import React from 'react';
import Icon from '../icons';

/**
 * Phone navigation. The header tabs were 30px tall — under the 44px minimum,
 * and the only navigation in the app. Below 768px they hide and this takes
 * over: full-width targets at the bottom of the screen, where a thumb is.
 *
 * Two destinations only. Everything an administrator does lives at its own
 * path behind sign-in, so a shared phone or terminal never shows a hint of it.
 */
const TABS = [
  { key: 'map', label: 'Find', icon: 'search' },
  { key: 'community', label: 'Community', icon: 'calendar' }
];

const BottomNav = ({ activeTab, onTabChange }) => (
  <nav className="bottom-nav" aria-label="Sections">
    {TABS.map((tab) => (
      <button
        key={tab.key}
        className={activeTab === tab.key ? 'active' : ''}
        onClick={() => onTabChange(tab.key)}
        aria-current={activeTab === tab.key ? 'page' : undefined}
      >
        <Icon name={tab.icon} size={20} />
        <span>{tab.label}</span>
      </button>
    ))}
  </nav>
);

export default BottomNav;

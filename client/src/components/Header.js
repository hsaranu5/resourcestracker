import React from 'react';
import Icon from '../icons';

/**
 * Two public destinations, and the two controls that have nowhere else to live.
 *
 * There is no settings screen: this app is used mostly on library and shelter
 * terminals where browser state is wiped between visitors, so a page of
 * preferences would be a page of things nobody gets to keep. Theme and
 * "Start over" are one tap each, right here.
 *
 * The tabs are hidden below 768px, where BottomNav takes over — 30px text
 * buttons in a header are the wrong target size on a phone.
 */
const Header = ({ activeTab, onTabChange, theme, onToggleTheme, onStartOver }) => (
  <header className="header">
    <h1>KC Resources</h1>
    <div className="header-right">
      <nav className="header-tabs" aria-label="Sections">
        <button
          className={activeTab === 'map' ? 'active' : ''}
          onClick={() => onTabChange('map')}
          aria-current={activeTab === 'map' ? 'page' : undefined}
        >
          Find
        </button>
        <button
          className={activeTab === 'community' ? 'active' : ''}
          onClick={() => onTabChange('community')}
          aria-current={activeTab === 'community' ? 'page' : undefined}
        >
          Community
        </button>
      </nav>

      <button
        className="header-action"
        onClick={onStartOver}
        title="Clear this browser and start fresh — for shared computers"
      >
        <Icon name="refresh" size={15} /> <span className="header-action-label">Start over</span>
      </button>

      <button
        className="header-action header-action-icon"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle light/dark mode"
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
    </div>
  </header>
);

export default Header;

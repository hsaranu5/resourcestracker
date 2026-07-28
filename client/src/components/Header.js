import React from 'react';
import Icon from '../icons';

const Header = ({ activeTab, onTabChange, theme, onToggleTheme }) => (
  <header className="header">
    <h1>KC Resources</h1>
    <div className="header-right">
      <nav className="header-tabs">
        <button
          className={activeTab === 'map' ? 'active' : ''}
          onClick={() => onTabChange('map')}
        >
          Map
        </button>
        <button
          className={activeTab === 'community' ? 'active' : ''}
          onClick={() => onTabChange('community')}
        >
          Community
        </button>
      </nav>
      <button
        className="theme-toggle"
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

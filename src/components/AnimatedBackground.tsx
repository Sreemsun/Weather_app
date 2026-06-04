import React from 'react';
import { WeatherKey } from '../lib/weather';

type Props = { themeKey: WeatherKey };

function randomStyles(index: number, count: number) {
  const left = Math.round((index / count) * 100) + Math.random() * 4 - 2;
  const delay = Math.random() * -6;
  const duration = 1.2 + Math.random() * 1.6;
  return { left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s` } as React.CSSProperties;
}

export default function AnimatedBackground({ themeKey }: Props) {
  if (themeKey === 'rain' || themeKey === 'storm') {
    const drops = Array.from({ length: 36 }).map((_, i) => (
      <span key={i} className="rain-drop" style={randomStyles(i, 36)} />
    ));

    return (
      <div className={`animated-bg animated-${themeKey}`} aria-hidden>
        <div className="clouds">
          <div className="cloud c1" />
          <div className="cloud c2" />
          <div className="cloud c3" />
        </div>
        <div className="rain-layer">{drops}</div>
        {themeKey === 'storm' ? <div className="lightning" /> : null}
      </div>
    );
  }

  if (themeKey === 'snow') {
    const flakes = Array.from({ length: 28 }).map((_, i) => (
      <span key={i} className="snow-flake" style={randomStyles(i, 28)} />
    ));

    return (
      <div className="animated-bg animated-snow" aria-hidden>
        <div className="clouds small">
          <div className="cloud c1" />
          <div className="cloud c2" />
        </div>
        <div className="snow-layer">{flakes}</div>
      </div>
    );
  }

  if (themeKey === 'sun') {
    return (
      <div className="animated-bg animated-sun" aria-hidden>
        <div className="sun" />
      </div>
    );
  }

  // default: clouds
  return (
    <div className="animated-bg animated-clouds" aria-hidden>
      <div className="clouds">
        <div className="cloud c1" />
        <div className="cloud c2" />
        <div className="cloud c3" />
      </div>
    </div>
  );
}

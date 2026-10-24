import React from 'react';

const DIGITS = '0123456789'.split('');

export const Odometer: React.FC<{ text: string }> = ({ text }) => (
  <span className="aq-odo fx-odometer-roll" aria-hidden="true">
    {[...text].map((ch, i) => {
      const key = text.length - i;
      return /\d/.test(ch) ? (
        <span key={key} className="aq-odo-col">
          <span className="aq-odo-strip" style={{ transform: `translateY(${-Number(ch)}em)` }}>
            {DIGITS.map((d) => (
              <i key={d}>{d}</i>
            ))}
          </span>
        </span>
      ) : (
        <span key={key} className="aq-odo-sep">{ch}</span>
      );
    })}
  </span>
);

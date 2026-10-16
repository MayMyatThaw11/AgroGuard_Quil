import React from 'react';

export const SessionError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <main className="min-h-screen bg-(--ops-haze) text-(--ops-ink) px-4 py-8 max-w-xl mx-auto">
    <header className="mb-4">
      <h1 className="text-[18px] font-bold">AgriQill</h1>
      <p className="text-[12px] text-(--ops-ink-3)">The farm service could not confirm who you are.</p>
    </header>
    <section className="ops-task">
      <p className="mb-3 text-[13px] text-(--ops-red)" role="alert">
        {message}
      </p>
      <button type="button" className="ops-btn is-primary w-full justify-center py-3" onClick={onRetry}>
        Retry
      </button>
    </section>
  </main>
);

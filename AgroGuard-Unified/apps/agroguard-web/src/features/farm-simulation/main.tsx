import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SessionError } from './components/SessionError.tsx';
import { SignIn } from './components/SignIn.tsx';
import { FieldApp } from './components/field/FieldApp.tsx';
import { StoryApp } from './components/story/StoryApp.tsx';
import { bootPaddySettings } from './lib/paddySettingsBoot.ts';
import { checkSession } from './lib/sessionGate.ts';
import './index.css';

bootPaddySettings();

const params = new URLSearchParams(window.location.search);
const fieldFarm = params.has('field') ? params.get('farm') || 'farm_ayeyarwady_demo' : null;

const Root: React.FC = () => {
  const [session, setSession] = useState<Awaited<ReturnType<typeof checkSession>> | undefined>(undefined);
  const refresh = () => void checkSession().then(setSession);

  useEffect(refresh, []);

  if (!fieldFarm && params.has('story')) return <StoryApp />;
  if (session === undefined) return null;
  if (session === null) return <SignIn onSignedIn={refresh} />;
  if ('error' in session) return <SessionError message={session.error} onRetry={refresh} />;
  if (fieldFarm) return <FieldApp farmId={fieldFarm} />;
  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

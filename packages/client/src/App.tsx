import { useState } from 'react';
import { Home } from './components/Lobby';
import { Table } from './components/Table';
import { useLocalGame } from './state/useLocalGame';

type Screen = { kind: 'home' } | { kind: 'local'; name: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  if (screen.kind === 'local') return <LocalGame name={screen.name} onLeave={() => setScreen({ kind: 'home' })} />;
  return <Home onPlayBots={(name) => setScreen({ kind: 'local', name })} />;
}

function LocalGame({ name, onLeave }: { name: string; onLeave: () => void }) {
  const ctrl = useLocalGame(name, onLeave);
  return <Table ctrl={ctrl} />;
}

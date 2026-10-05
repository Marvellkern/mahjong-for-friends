import { useState } from 'react';
import { Home, LobbyRoom, loadName } from './components/Lobby';
import { Table } from './components/Table';
import { useLocalGame } from './state/useLocalGame';
import { knowsRoom, useRemoteGame } from './state/useRemoteGame';
import { S } from './strings';

type Screen =
  | { kind: 'home'; code?: string; notice?: string }
  | { kind: 'local'; name: string }
  | { kind: 'remote'; name: string; target: { create: true } | { code: string } };

/** ?room=ABCD in the URL means "join this room". */
function roomFromUrl(): string | undefined {
  const code = new URLSearchParams(location.search).get('room');
  return code && /^[A-Za-z]{4}$/.test(code) ? code.toUpperCase() : undefined;
}

function setUrlRoom(code: string | null) {
  const url = code ? `/?room=${code}` : '/';
  if (location.pathname + location.search !== url) history.replaceState(null, '', url);
}

function initialScreen(): Screen {
  const code = roomFromUrl();
  const name = loadName();
  // Back in a room this browser already sat in (reload, reopened link): rejoin straight away.
  // A first visit shows the Join screen so the friend can confirm their name.
  if (code && name && knowsRoom(code)) return { kind: 'remote', name, target: { code } };
  return { kind: 'home', code };
}

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const home = (notice?: string) => {
    setUrlRoom(null);
    setScreen({ kind: 'home', notice });
  };

  switch (screen.kind) {
    case 'local':
      return <LocalGame name={screen.name} onLeave={() => home()} />;
    case 'remote':
      return (
        <RemoteGame
          key={JSON.stringify(screen.target)}
          name={screen.name}
          target={screen.target}
          onLeave={home}
        />
      );
    default:
      return (
        <Home
          initialCode={screen.code}
          notice={screen.notice}
          onPlayBots={(name) => setScreen({ kind: 'local', name })}
          onCreate={(name) => setScreen({ kind: 'remote', name, target: { create: true } })}
          onJoin={(name, code) => setScreen({ kind: 'remote', name, target: { code } })}
        />
      );
  }
}

function LocalGame({ name, onLeave }: { name: string; onLeave: () => void }) {
  const ctrl = useLocalGame(name, onLeave);
  return <Table ctrl={ctrl} />;
}

function RemoteGame({
  name,
  target,
  onLeave,
}: {
  name: string;
  target: { create: true } | { code: string };
  onLeave: (notice?: string) => void;
}) {
  const room = useRemoteGame(target, name, (code) => setUrlRoom(code), () => onLeave());

  if (room.joinError) {
    return <JoinFailed message={room.joinError} onBack={() => onLeave()} />;
  }
  if (room.controller) return <Table ctrl={room.controller} />;
  if (room.snapshot) return <LobbyRoom room={room} />;
  return (
    <div className="grid min-h-dvh place-items-center text-white/80" role="status">
      {room.connection === 'connecting' ? S.connecting : S.reconnecting}
    </div>
  );
}

function JoinFailed({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <p role="alert" className="text-lg font-semibold">
        {message}
      </p>
      <button className="min-h-12 rounded-xl bg-gold px-6 font-extrabold text-[#1d1d1d]" onClick={onBack}>
        {S.backHome}
      </button>
    </div>
  );
}

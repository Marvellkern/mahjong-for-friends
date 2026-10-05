/**
 * All UI text lives here so a translation (e.g. Indonesian) can be added later
 * by copying this object and swapping it in.
 */
export const S = {
  gameName: 'Mahjong for Friends',
  tagline: 'Four sets + one pair wins. No minimum score.',

  // Home / lobby
  yourName: 'Your name',
  namePlaceholder: 'e.g. Marvell',
  playBots: 'Play vs 3 bots',
  createRoom: 'Create a room',
  joinRoom: 'Join',
  roomCode: 'Room code',
  roomCodePlaceholder: 'ABCD',
  orJoin: 'or join friends',
  lobbyTitle: (code: string) => `Room ${code}`,
  shareLink: 'Share this link with your friends:',
  copyLink: 'Copy link',
  copied: 'Copied!',
  seatEmpty: 'Empty seat',
  seatBotWillFill: 'A bot will sit here',
  addBot: 'Add bot',
  removeBot: 'Remove bot',
  startGame: 'Start game',
  waitingForHost: (host: string) => `Waiting for ${host} to start…`,
  hostTag: 'host',
  youTag: 'you',
  leave: 'Leave',
  backHome: 'Back',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting… hang tight.',
  roomNotFound: "That room doesn't exist (the server may have restarted).",
  roomFull: 'That room is full.',

  // Table
  you: 'You',
  botName: (n: number) => `Bot ${n}`,
  dealer: 'Dealer',
  dealerShort: 'D',
  bot: 'bot',
  disconnected: 'disconnected',
  wall: 'Wall',
  round: (n: number) => `Round ${n}`,
  tilesLeft: (n: number) => `${n} tiles left`,
  wins: (n: number) => (n === 1 ? '1 win' : `${n} wins`),

  // Status line: whose turn and what you can do right now
  statusYourTurn: 'Your turn: tap a tile, then tap it again to discard.',
  statusYourTurnAfterCall: 'Nice one! Now discard a tile.',
  statusYourTurnWin: 'You have Mahjong! Tap “Mahjong!” to win.',
  statusTheirTurn: (name: string) => `${name}'s turn…`,
  statusClaim: (name: string, tile: string) => `${name} discarded ${tile}. Want it?`,
  statusWaitingClaims: 'Waiting for the others to decide…',
  statusRoundOver: 'Round over.',

  // Actions
  mahjong: 'Mahjong!',
  kong: 'Kong',
  pung: 'Pung',
  chow: 'Chow',
  pass: 'Pass',
  discard: 'Discard',
  concealedKong: 'Kong',
  addedKong: 'Add to Kong',
  chooseChow: 'Which chow?',
  secondsLeft: (s: number) => `${s}s`,

  // Call banners
  callBanner: {
    pung: 'Pung!',
    kong: 'Kong!',
    chow: 'Chow!',
    concealed_kong: 'Kong!',
    added_kong: 'Kong!',
    win: 'Mahjong!',
  } as Record<string, string>,

  // Round end
  youWon: 'You won! 🎉',
  someoneWon: (name: string) => `${name} wins!`,
  wonBySelfDraw: 'Self-drawn',
  wonByDiscard: (from: string) => `On ${from}'s discard`,
  wallEmpty: "Wall's empty, nobody wins.",
  nextRound: 'Next round',
  tally: 'Wins this session',
  winningTile: 'winning tile',

  // Settings
  hintToggle: 'Show tiles I’m waiting for',
  waitingFor: 'Waiting for:',
  soundToggle: 'Sounds',

  // Errors
  genericError: 'Something went wrong. Try again?',
} as const;

// Inline SVG marks for the wallets we expose in the connect modal.
// Simplified silhouettes (not pixel-exact brand logos) so we can ship them
// without licensing attachments and without an extra HTTP request.

export type WalletKind = "metamask" | "coinbase" | "walletconnect" | "safe" | "injected" | "generic";

export function WalletIcon({ kind, size = 24 }: { kind: WalletKind; size?: number }) {
  switch (kind) {
    case "metamask":
      return <MetaMaskIcon size={size} />;
    case "coinbase":
      return <CoinbaseIcon size={size} />;
    case "walletconnect":
      return <WalletConnectIcon size={size} />;
    case "safe":
      return <SafeIcon size={size} />;
    case "injected":
      return <InjectedIcon size={size} />;
    default:
      return <GenericIcon size={size} />;
  }
}

function MetaMaskIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M27.4 4 18 11l1.7-4L27.4 4Z" fill="#E2761B" />
      <path d="M4.6 4 13.9 11.1 12.3 7 4.6 4Z" fill="#E4761B" />
      <path d="M23.7 21.5 21.2 25.3l5.4 1.5 1.5-5.2-4.4-.1ZM3.9 21.6l1.5 5.2 5.4-1.5-2.5-3.8-4.4.1Z" fill="#E4761B" />
      <path d="M10.5 14.4 9 16.6l5.4.2-.2-5.8-3.7 3.4ZM21.5 14.4l-3.7-3.4-.1 5.9 5.3-.3-1.5-2.2ZM10.8 25.3l3.2-1.5-2.8-2.2-.4 3.7ZM18 23.8l3.2 1.5-.4-3.7-2.8 2.2Z" fill="#E4761B" />
      <path d="M21.2 25.3 18 23.8l.3 2.1-.1.9 3-1.5ZM10.8 25.3l3 1.5v-.9l.2-2.1-3.2 1.5Z" fill="#D7C1B3" />
      <path d="m13.9 20.3-2.7-.8 1.9-.9.8 1.7ZM18.1 20.3l.8-1.7 1.9.9-2.7.8Z" fill="#233447" />
      <path d="m10.8 25.3.5-3.8-2.9.1 2.4 3.7ZM21.7 21.5l.5 3.8 2.4-3.7-2.9-.1ZM23 16.6l-5.3.3.5 2.7 1-1.7 1.9.9 1.9-2.2ZM11.2 19.5l1.9-.9 1 1.7.5-2.7L9 16.6l2.2 2.9Z" fill="#CD6116" />
      <path d="m9 16.6 2.3 4.4-.1-2.2L9 16.6ZM20.8 18.8l-.1 2.2 2.3-4.4-2.2 2.2ZM14.4 16.9l-.5 2.7.6 3.2.2-4.2-.3-1.7ZM17.7 16.9l-.3 1.7.1 4.2.6-3.2-.4-2.7Z" fill="#E4751F" />
      <path d="m18.1 20.3-.6 3.2.4.3 2.8-2.2.1-2.2-2.7.9ZM11.2 19.5l.1 2.2 2.8 2.2.4-.3-.6-3.3-2.7-.8Z" fill="#F6851B" />
      <path d="m18.2 26.8.1-.9-.3-.2H14l-.2.2.1.9-3-1.5 1.1.9 2.2 1.5h3.8l2.2-1.5 1.1-.9-3 1.5Z" fill="#C0AD9E" />
      <path d="m17.9 23.8-.4-.3h-3l-.4.3-.2 2.1.2-.2h3.8l.2.2-.2-2.1Z" fill="#161616" />
      <path d="m27.8 11.4 1-3.6-1.4-3.8-9.4 7 3.6 3 5.1 1.5 1.1-1.3-.5-.4.8-.7-.6-.4.8-.6-.5-.7ZM3.2 7.8l1 3.6-.7.5.8.6-.6.4.8.7-.5.4 1.1 1.3 5.1-1.5 3.6-3-9.4-7-1.2 3.8Z" fill="#763D16" />
      <path d="m27.1 15.5-5.1-1.5 1.5 2.3-2.3 4.4 3-.1h4.4l-1.5-5.1ZM10 14l-5.1 1.5L3.5 20.6h4.4l3 .1-2.3-4.4L10 14ZM17.7 16.9l.3-5.7 1.5-4.1h-7l1.5 4.1.3 5.7.1 1.8v4.2h3v-4.2l.1-1.8Z" fill="#F6851B" />
    </svg>
  );
}

function CoinbaseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <rect x="11" y="11" width="10" height="10" rx="1" fill="#fff" />
    </svg>
  );
}

function WalletConnectIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#3B99FC" />
      <path
        d="M9.6 12.6c3.5-3.4 9.3-3.4 12.8 0l.4.4c.2.2.2.5 0 .7l-1.5 1.4c-.1.1-.2.1-.3 0l-.6-.6c-2.5-2.4-6.4-2.4-8.9 0l-.6.6c-.1.1-.2.1-.3 0L9.1 13.7c-.2-.2-.2-.5 0-.7l.5-.4Zm15.8 2.9 1.4 1.3c.2.2.2.5 0 .7l-6.1 6c-.2.2-.5.2-.7 0L15.7 19c0 0-.1 0-.1 0l-4.3 4.4c-.2.2-.5.2-.7 0L4.5 17.4c-.2-.2-.2-.5 0-.7l1.4-1.3c.2-.2.5-.2.7 0l4.3 4.3c0 .1.1.1.1 0l4.3-4.3c.2-.2.5-.2.7 0l4.3 4.3c0 .1.1.1.1 0l4.3-4.3c.2-.2.5-.2.7.1Z"
        fill="#fff"
      />
    </svg>
  );
}

function SafeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="6" fill="#12FF80" />
      <path
        d="M11.5 9.5h6c1.5 0 2.7 1.2 2.7 2.7v.6h-2.4v-.4c0-.4-.4-.8-.8-.8h-5.4c-.4 0-.8.4-.8.8v1.4c0 .4.4.8.8.8h6c1.5 0 2.7 1.2 2.7 2.7v2.7c0 1.5-1.2 2.7-2.7 2.7h-6c-1.5 0-2.7-1.2-2.7-2.7v-.6h2.4v.4c0 .4.4.8.8.8h5.4c.4 0 .8-.4.8-.8v-1.4c0-.4-.4-.8-.8-.8h-6c-1.5 0-2.7-1.2-2.7-2.7v-2.7c0-1.5 1.2-2.7 2.7-2.7Z"
        fill="#0a3d24"
      />
    </svg>
  );
}

function InjectedIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="26" height="20" rx="3" fill="#6c4cff" />
      <rect x="3" y="6" width="26" height="5" rx="3" fill="#4a2fdc" />
      <circle cx="6.5" cy="8.5" r="0.7" fill="#fff" />
      <circle cx="9" cy="8.5" r="0.7" fill="#fff" />
      <circle cx="11.5" cy="8.5" r="0.7" fill="#fff" />
      <rect x="7" y="14" width="18" height="2" rx="1" fill="#fff" opacity="0.85" />
      <rect x="7" y="18" width="12" height="2" rx="1" fill="#fff" opacity="0.6" />
    </svg>
  );
}

function GenericIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="24" height="18" rx="3" fill="#637189" />
      <rect x="4" y="11" width="24" height="3" fill="#4d556a" />
      <circle cx="22" cy="20" r="2" fill="#fff" />
    </svg>
  );
}

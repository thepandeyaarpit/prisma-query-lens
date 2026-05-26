interface Props { callChain: string[] }

export function CallChainBar({ callChain }: Props) {
  if (callChain.length === 0) return null;
  return (
    <div className="call-chain-bar">
      <span className="call-chain-label">Call chain:</span>
      {callChain.map((fn, i) => (
        <span key={fn} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="fn-chip">{fn}</span>
          {i < callChain.length - 1 && <span className="chain-arrow">→</span>}
        </span>
      ))}
    </div>
  );
}

import React from 'react';
import { shortLabel } from '../utils/format';

/** A route drawn like a metro line: stations joined by a coloured bar. */
export default function RouteStrip({ labels, relayIds = [], nodeIds, hops = [], color = 'var(--red)' }) {
  return (
    <div className="strip" style={{ '--line': color }} role="img" aria-label={`Route: ${labels.join(' to ')}`}>
      {labels.map((label, i) => {
        const end = i === 0 || i === labels.length - 1;
        const isRelay = relayIds.includes(nodeIds?.[i]);
        return (
          <React.Fragment key={`${nodeIds?.[i] ?? i}-${i}`}>
            <div className={`stop${end ? ' end' : ''}`}>
              <span className="stop-dot" />
              <span className="stop-name">{shortLabel(label)}</span>
              <span className="stop-sub">{i === 0 ? 'origin' : i === labels.length - 1 ? 'destination' : isRelay ? 'relay' : ''}</span>
            </div>
            {i < labels.length - 1 && (
              <div className="seg-line">
                {hops[i] && <span className="seg-tag num">{hops[i].latencyMs} ms</span>}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

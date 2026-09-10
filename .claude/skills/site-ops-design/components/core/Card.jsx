import React from 'react';
export function Card({children,padding='var(--space-5)'}){
return <div style={{background:'var(--color-surface)',border:'var(--border-width) solid var(--color-border)',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-sm)',padding}}>{children}</div>;
}

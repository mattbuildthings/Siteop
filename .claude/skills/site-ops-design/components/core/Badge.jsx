import React from 'react';
export function Badge({tone='neutral',children}){
const tones={neutral:{bg:'var(--gray-200)',fg:'var(--gray-700)'},primary:{bg:'var(--teal-100)',fg:'var(--teal-700)'},success:{bg:'#E4EFE5',fg:'var(--color-success)'},warning:{bg:'var(--orange-100)',fg:'var(--orange-700)'},danger:{bg:'#F6DEDC',fg:'var(--color-danger)'}};
const t=tones[tone];
return <span style={{display:'inline-flex',alignItems:'center',height:22,padding:'0 8px',borderRadius:'var(--radius-pill)',background:t.bg,color:t.fg,fontFamily:'var(--font-body)',fontSize:'var(--fs-2xs)',fontWeight:'var(--fw-semibold)',textTransform:'uppercase',letterSpacing:'var(--ls-caps)'}}>{children}</span>;
}

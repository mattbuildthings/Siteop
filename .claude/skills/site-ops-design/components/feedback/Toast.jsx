import React from 'react';
export function Toast({tone='primary',children}){
const tones={primary:{bg:'var(--teal-800)'},success:{bg:'var(--color-success)'},danger:{bg:'var(--color-danger)'}};
return <div style={{display:'inline-flex',alignItems:'center',gap:10,padding:'10px 16px',borderRadius:'var(--radius-md)',background:tones[tone].bg,color:'#fff',fontFamily:'var(--font-body)',fontSize:'var(--fs-sm)',fontWeight:'var(--fw-medium)',boxShadow:'var(--shadow-lg)'}}>{children}</div>;
}

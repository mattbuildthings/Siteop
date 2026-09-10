import React from 'react';
export function Tabs({tabs=[],active,onChange}){
return <div style={{display:'flex',gap:'var(--space-5)',borderBottom:'var(--border-width) solid var(--color-border)',fontFamily:'var(--font-body)'}}>
{tabs.map(t=><button key={t} onClick={()=>onChange&&onChange(t)} style={{background:'none',border:'none',padding:'10px 2px',fontSize:'var(--fs-md)',fontWeight:'var(--fw-semibold)',color:t===active?'var(--color-primary)':'var(--color-text-secondary)',borderBottom:t===active?'var(--border-width-strong) solid var(--color-primary)':'var(--border-width-strong) solid transparent',cursor:'pointer'}}>{t}</button>)}
</div>;
}

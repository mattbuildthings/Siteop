import React from 'react';
export function Select({label,options=[],value,onChange}){
return <label style={{display:'flex',flexDirection:'column',gap:6,fontFamily:'var(--font-body)'}}>
{label&&<span style={{fontSize:'var(--fs-sm)',fontWeight:'var(--fw-medium)',color:'var(--color-text-primary)'}}>{label}</span>}
<select value={value} onChange={onChange} style={{height:44,padding:'0 var(--space-3)',fontSize:'var(--fs-md)',fontFamily:'var(--font-body)',border:'var(--border-width-strong) solid var(--color-border-strong)',borderRadius:'var(--radius-md)',background:'var(--color-surface)',color:'var(--color-text-primary)'}}>
{options.map(o=><option key={o} value={o}>{o}</option>)}
</select>
</label>;
}

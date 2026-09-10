import React from 'react';
export function Checkbox({label,checked,onChange}){
return <label style={{display:'inline-flex',alignItems:'center',gap:10,fontFamily:'var(--font-body)',fontSize:'var(--fs-md)',color:'var(--color-text-primary)',cursor:'pointer'}}>
<span style={{width:20,height:20,borderRadius:'var(--radius-sm)',border:`var(--border-width-strong) solid ${checked?'var(--color-primary)':'var(--color-border-strong)'}`,background:checked?'var(--color-primary)':'var(--color-surface)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
{checked&&<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 6l3.5 3.5L11 2" stroke="#fff" strokeWidth="2" fill="none"/></svg>}
</span>
<input type="checkbox" checked={checked} onChange={onChange} style={{display:'none'}}/>{label}
</label>;
}

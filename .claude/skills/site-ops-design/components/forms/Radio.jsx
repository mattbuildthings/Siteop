import React from 'react';
export function Radio({label,checked,onChange}){
return <label style={{display:'inline-flex',alignItems:'center',gap:10,fontFamily:'var(--font-body)',fontSize:'var(--fs-md)',color:'var(--color-text-primary)',cursor:'pointer'}}>
<span style={{width:20,height:20,borderRadius:'50%',border:`var(--border-width-strong) solid ${checked?'var(--color-primary)':'var(--color-border-strong)'}`,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
{checked&&<span style={{width:10,height:10,borderRadius:'50%',background:'var(--color-primary)'}}/>}
</span>
<input type="radio" checked={checked} onChange={onChange} style={{display:'none'}}/>{label}
</label>;
}

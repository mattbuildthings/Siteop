import React from 'react';
export function Input({label,placeholder,value,onChange,error,type='text'}){
return <label style={{display:'flex',flexDirection:'column',gap:6,fontFamily:'var(--font-body)'}}>
{label&&<span style={{fontSize:'var(--fs-sm)',fontWeight:'var(--fw-medium)',color:'var(--color-text-primary)'}}>{label}</span>}
<input type={type} placeholder={placeholder} value={value} onChange={onChange} style={{height:44,padding:'0 var(--space-3)',fontSize:'var(--fs-md)',fontFamily:'var(--font-body)',border:`var(--border-width-strong) solid ${error?'var(--color-danger)':'var(--color-border-strong)'}`,borderRadius:'var(--radius-md)',background:'var(--color-surface)',color:'var(--color-text-primary)',outline:'none'}}
onFocus={e=>e.currentTarget.style.borderColor='var(--color-focus-ring)'}
onBlur={e=>e.currentTarget.style.borderColor=error?'var(--color-danger)':'var(--color-border-strong)'}/>
{error&&<span style={{fontSize:'var(--fs-xs)',color:'var(--color-danger)'}}>{error}</span>}
</label>;
}

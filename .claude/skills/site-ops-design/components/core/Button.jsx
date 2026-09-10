import React from 'react';
export function Button({variant='primary',size='md',disabled=false,icon=null,children,onClick}){
const sizes={sm:{h:32,fs:'var(--fs-sm)',px:'var(--space-3)'},md:{h:40,fs:'var(--fs-md)',px:'var(--space-4)'},lg:{h:48,fs:'var(--fs-lg)',px:'var(--space-5)'}};
const s=sizes[size];
const variants={
primary:{background:'var(--color-primary)',color:'var(--color-on-primary)',border:'none'},
accent:{background:'var(--color-accent)',color:'var(--color-on-accent)',border:'none'},
secondary:{background:'var(--color-surface)',color:'var(--color-text-primary)',border:'var(--border-width-strong) solid var(--color-border-strong)'},
ghost:{background:'transparent',color:'var(--color-primary)',border:'none'},
danger:{background:'var(--color-danger)',color:'#fff',border:'none'}
};
const base={display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'var(--space-2)',height:s.h,padding:`0 ${s.px}`,fontFamily:'var(--font-body)',fontSize:s.fs,fontWeight:'var(--fw-semibold)',borderRadius:'var(--radius-md)',cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,transition:`background var(--duration-fast) var(--ease-standard)`,...variants[variant]};
return <button style={base} disabled={disabled} onClick={onClick}
onMouseEnter={e=>{if(!disabled&&variant==='primary')e.currentTarget.style.background='var(--color-primary-hover)';if(!disabled&&variant==='accent')e.currentTarget.style.background='var(--color-accent-hover)'}}
onMouseLeave={e=>{if(variant==='primary')e.currentTarget.style.background='var(--color-primary)';if(variant==='accent')e.currentTarget.style.background='var(--color-accent)'}}>
{icon}{children}
</button>;
}

import React from 'react';
export function Dialog({title,children,onClose,footer}){
return <div style={{position:'fixed',inset:0,background:'rgba(18,39,38,0.5)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-body)'}}>
<div style={{background:'var(--color-surface)',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-lg)',width:360,padding:'var(--space-5)'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--space-4)'}}>
<div style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:'var(--fs-xl)',textTransform:'uppercase'}}>{title}</div>
<button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--color-text-secondary)'}}>×</button>
</div>
<div style={{color:'var(--color-text-secondary)',fontSize:'var(--fs-md)'}}>{children}</div>
{footer&&<div style={{marginTop:'var(--space-5)',display:'flex',gap:'var(--space-3)',justifyContent:'flex-end'}}>{footer}</div>}
</div>
</div>;
}

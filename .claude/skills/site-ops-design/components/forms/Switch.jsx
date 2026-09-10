import React from 'react';
export function Switch({checked,onChange,label}){
return <label style={{display:'inline-flex',alignItems:'center',gap:10,fontFamily:'var(--font-body)',fontSize:'var(--fs-md)',color:'var(--color-text-primary)',cursor:'pointer'}}>
<span onClick={onChange} style={{width:40,height:24,borderRadius:'var(--radius-pill)',background:checked?'var(--color-primary)':'var(--gray-300)',position:'relative',transition:'background var(--duration-fast) var(--ease-standard)'}}>
<span style={{position:'absolute',top:2,left:checked?18:2,width:20,height:20,borderRadius:'50%',background:'#fff',boxShadow:'var(--shadow-sm)',transition:'left var(--duration-fast) var(--ease-standard)'}}/>
</span>{label}
</label>;
}

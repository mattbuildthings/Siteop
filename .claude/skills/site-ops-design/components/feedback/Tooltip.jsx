import React from 'react';
export function Tooltip({label,children}){
const[show,setShow]=React.useState(false);
return <span style={{position:'relative',display:'inline-block'}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
{children}
{show&&<span style={{position:'absolute',bottom:'calc(100% + 6px)',left:'50%',transform:'translateX(-50%)',background:'var(--gray-900)',color:'#fff',fontSize:'var(--fs-2xs)',padding:'4px 8px',borderRadius:'var(--radius-sm)',whiteSpace:'nowrap',fontFamily:'var(--font-body)'}}>{label}</span>}
</span>;
}

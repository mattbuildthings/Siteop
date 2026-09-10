import React from 'react';
export function NoteCard({type='photo',thumbnail,title,timestamp,author,synced=true}){
return <div style={{display:'flex',gap:'var(--space-3)',padding:'var(--space-3)',background:'var(--color-surface)',border:'var(--border-width) solid var(--color-border)',borderRadius:'var(--radius-md)',fontFamily:'var(--font-body)'}}>
<div style={{width:56,height:56,borderRadius:'var(--radius-sm)',background:'var(--gray-200)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--color-text-tertiary)',overflow:'hidden'}}>
{thumbnail?<img src={thumbnail} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:(type==='audio'?'🎤':'📷')}
</div>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:'var(--fs-md)',fontWeight:'var(--fw-semibold)',color:'var(--color-text-primary)'}}>{title}</div>
<div style={{fontSize:'var(--fs-xs)',color:'var(--color-text-secondary)',fontFamily:'var(--font-mono)',marginTop:2}}>{timestamp} · {author}</div>
</div>
<div style={{fontSize:'var(--fs-2xs)',color:synced?'var(--color-success)':'var(--color-warning)',fontWeight:'var(--fw-semibold)',alignSelf:'flex-start'}}>{synced?'SYNCED':'PENDING'}</div>
</div>;
}

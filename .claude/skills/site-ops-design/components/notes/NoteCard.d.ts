/**
 * @startingPoint section="Components" subtitle="Photo/audio field-note row with sync status" viewport="700x120"
 */
export interface NoteCardProps{type?:'photo'|'audio';thumbnail?:string;title:string;timestamp:string;author:string;synced?:boolean;}
